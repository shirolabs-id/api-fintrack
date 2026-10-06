import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSavingGoalDto,
  UpdateSavingGoalDto,
  AddSavingContributionDto,
} from './dto/saving.dto';

const GOAL_SELECT = {
  id: true,
  name: true,
  targetAmount: true,
  currentAmount: true,
  targetDate: true,
  category: true,
  color: true,
  icon: true,
  notes: true,
  isArchived: true,
  isCompleted: true,
  createdAt: true,
  updatedAt: true,
  contributions: {
    orderBy: { date: 'desc' as const },
    select: {
      id: true,
      savingGoalId: true,
      amount: true,
      date: true,
      notes: true,
      accountId: true,
      createdAt: true,
    },
  },
} satisfies Prisma.SavingGoalSelect;

@Injectable()
export class SavingsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, includeArchived = false) {
    const goals = await this.prisma.savingGoal.findMany({
      where: { userId, ...(includeArchived ? {} : { isArchived: false }) },
      orderBy: { createdAt: 'asc' },
      select: GOAL_SELECT,
    });
    return goals;
  }

  async findOne(userId: string, id: string) {
    const goal = await this.prisma.savingGoal.findFirst({ where: { id, userId }, select: GOAL_SELECT });
    if (!goal) throw new NotFoundException('Target tabungan tidak ditemukan');
    return goal;
  }

  async create(userId: string, dto: CreateSavingGoalDto) {
    return this.prisma.savingGoal.create({
      data: {
        userId,
        name: dto.name,
        targetAmount: dto.targetAmount,
        currentAmount: dto.currentAmount ?? 0,
        targetDate: new Date(dto.targetDate),
        category: dto.category,
        color: dto.color,
        icon: dto.icon,
        notes: dto.notes,
      },
      select: GOAL_SELECT,
    });
  }

  async update(userId: string, id: string, dto: UpdateSavingGoalDto) {
    const goal = await this.prisma.savingGoal.findFirst({ where: { id, userId } });
    if (!goal) throw new NotFoundException('Target tabungan tidak ditemukan');
    return this.prisma.savingGoal.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.targetAmount !== undefined ? { targetAmount: dto.targetAmount } : {}),
        ...(dto.targetDate ? { targetDate: new Date(dto.targetDate) } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.isArchived !== undefined ? { isArchived: dto.isArchived } : {}),
      },
      select: GOAL_SELECT,
    });
  }

  /**
   * Adds a contribution, bumps currentAmount (auto-completes at target), and —
   * when an account is given — records the outflow as an expense transaction so
   * account balances (computed from transactions) stay consistent.
   */
  async addContribution(userId: string, goalId: string, dto: AddSavingContributionDto) {
    await this.findOne(userId, goalId);
    if (dto.accountId) await this.ownAccountOrThrow(userId, dto.accountId);

    await this.prisma.$transaction(async (tx) => {
      await tx.savingsContribution.create({
        data: {
          userId,
          savingGoalId: goalId,
          accountId: dto.accountId,
          amount: dto.amount,
          date: new Date(dto.date),
          notes: dto.notes,
        },
      });
      const goal = await tx.savingGoal.update({
        where: { id: goalId },
        data: { currentAmount: { increment: dto.amount } },
      });
      if (!goal.isCompleted && goal.currentAmount >= goal.targetAmount) {
        await tx.savingGoal.update({ where: { id: goalId }, data: { isCompleted: true } });
      }
      if (dto.accountId) {
        await tx.transaction.create({
          data: {
            userId,
            type: 'expense',
            amount: dto.amount,
            date: new Date(dto.date),
            accountId: dto.accountId,
            description: dto.notes ? `Setoran tabungan: ${dto.notes}` : 'Setoran tabungan',
          },
        });
      }
    });

    return this.findOne(userId, goalId);
  }

  async remove(userId: string, id: string) {
    const goal = await this.prisma.savingGoal.findFirst({ where: { id, userId } });
    if (!goal) throw new NotFoundException('Target tabungan tidak ditemukan');
    await this.prisma.savingGoal.delete({ where: { id } });
    return { message: 'Target tabungan dihapus' };
  }

  private async ownAccountOrThrow(userId: string, accountId: string) {
    const acc = await this.prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!acc) throw new BadRequestException('Rekening tidak ditemukan');
  }
}
