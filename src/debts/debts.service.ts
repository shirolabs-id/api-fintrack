import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDebtDto,
  UpdateDebtDto,
  RecordDebtPaymentDto,
} from './dto/debt.dto';

const DEBT_SELECT = {
  id: true,
  type: true,
  personName: true,
  totalAmount: true,
  remainingAmount: true,
  startDate: true,
  dueDate: true,
  status: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  payments: {
    orderBy: { date: 'desc' as const },
    select: {
      id: true,
      debtId: true,
      amount: true,
      date: true,
      notes: true,
      accountId: true,
      createdAt: true,
    },
  },
} satisfies Prisma.DebtSelect;

type DebtRow = Prisma.DebtGetPayload<{ select: typeof DEBT_SELECT }>;

function toContract(d: DebtRow) {
  const paid = d.totalAmount - d.remainingAmount;
  return {
    id: d.id,
    type: d.type,
    personName: d.personName,
    totalAmount: d.totalAmount,
    remainingAmount: d.remainingAmount,
    startDate: d.startDate,
    dueDate: d.dueDate,
    status: d.status,
    description: d.description,
    paidAmount: paid,
    payments: d.payments,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

@Injectable()
export class DebtsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, type?: 'debt' | 'receivable', status?: string) {
    // `overdue` is derived at read time, so filter it from stored status + dueDate.
    const statusFilter: Prisma.DebtWhereInput =
      status === 'overdue'
        ? { status: { in: ['active', 'partially_paid'] }, dueDate: { lt: new Date() } }
        : status
          ? { status: status as Prisma.EnumDebtStatusFilter['equals'] }
          : {};

    const debts = await this.prisma.debt.findMany({
      where: { userId, ...(type ? { type } : {}), ...statusFilter },
      orderBy: { createdAt: 'desc' },
      select: DEBT_SELECT,
    });
    return debts.map((d) => this.refreshStatus(d));
  }

  async findOne(userId: string, id: string) {
    const debt = await this.prisma.debt.findFirst({ where: { id, userId }, select: DEBT_SELECT });
    if (!debt) throw new NotFoundException('Catatan hutang/piutang tidak ditemukan');
    return toContract(this.refreshStatus(debt));
  }

  async create(userId: string, dto: CreateDebtDto) {
    const start = new Date(dto.startDate ?? new Date().toISOString().slice(0, 10));
    const debt = await this.prisma.debt.create({
      data: {
        userId,
        type: dto.type,
        personName: dto.personName,
        totalAmount: dto.totalAmount,
        remainingAmount: dto.totalAmount,
        startDate: start,
        dueDate: new Date(dto.dueDate),
        description: dto.description,
      },
      select: DEBT_SELECT,
    });
    return toContract(debt);
  }

  async update(userId: string, id: string, dto: UpdateDebtDto) {
    const debt = await this.prisma.debt.findFirst({ where: { id, userId } });
    if (!debt) throw new NotFoundException('Catatan hutang/piutang tidak ditemukan');
    const updated = await this.prisma.debt.update({
      where: { id },
      data: {
        ...(dto.personName !== undefined ? { personName: dto.personName } : {}),
        ...(dto.totalAmount !== undefined
          ? { totalAmount: dto.totalAmount, remainingAmount: dto.totalAmount - (debt.totalAmount - debt.remainingAmount) }
          : {}),
        ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      select: DEBT_SELECT,
    });
    return toContract(this.refreshStatus(updated));
  }

  /**
   * Records a payment: decreases remainingAmount (auto-paid at zero) and — when
   * an account is given — records the money movement as a transaction so
   * account balances stay consistent.
   */
  async recordPayment(userId: string, debtId: string, dto: RecordDebtPaymentDto) {
    const debt = await this.prisma.debt.findFirst({ where: { id: debtId, userId } });
    if (!debt) throw new NotFoundException('Catatan hutang/piutang tidak ditemukan');
    if (debt.remainingAmount <= 0) throw new BadRequestException('Hutang ini sudah lunas');
    if (dto.amount > debt.remainingAmount) {
      throw new BadRequestException(
        `Pembayaran melebihi sisa tagihan (maks ${debt.remainingAmount})`,
      );
    }
    if (dto.accountId) {
      const acc = await this.prisma.account.findFirst({ where: { id: dto.accountId, userId } });
      if (!acc) throw new BadRequestException('Rekening tidak ditemukan');
    }

    const remaining = debt.remainingAmount - dto.amount;

    await this.prisma.$transaction(async (tx) => {
      await tx.debtPayment.create({
        data: {
          userId,
          debtId,
          accountId: dto.accountId,
          amount: dto.amount,
          date: new Date(dto.date),
          notes: dto.notes,
        },
      });
      await tx.debt.update({
        where: { id: debtId },
        data: {
          remainingAmount: { decrement: dto.amount },
          status: remaining <= 0 ? 'paid' : 'partially_paid',
        },
      });
      if (dto.accountId) {
        // debt  -> I pay money out of my account (expense)
        // receivable -> money comes into my account (income)
        await tx.transaction.create({
          data: {
            userId,
            type: debt.type === 'debt' ? 'expense' : 'income',
            amount: dto.amount,
            date: new Date(dto.date),
            accountId: dto.accountId,
            description: dto.notes
              ? `${debt.type === 'debt' ? 'Bayar hutang' : 'Terima piutang'}: ${debt.personName}`
              : `${debt.type === 'debt' ? 'Bayar hutang ke' : 'Terima piutang dari'} ${debt.personName}`,
          },
        });
      }
    });

    return this.findOne(userId, debtId);
  }

  async remove(userId: string, id: string) {
    const debt = await this.prisma.debt.findFirst({ where: { id, userId } });
    if (!debt) throw new NotFoundException('Catatan hutang/piutang tidak ditemukan');
    await this.prisma.debt.delete({ where: { id } });
    return { message: 'Catatan hutang/piutang dihapus' };
  }

  /** Derive partially_paid/overdue so the enum stays in sync with actual data. */
  private refreshStatus(d: DebtRow): DebtRow {
    if (d.status !== 'paid' && d.remainingAmount <= 0) {
      return { ...d, status: 'paid' as const };
    }
    if (
      (d.status === 'active' || d.status === 'partially_paid') &&
      d.dueDate &&
      d.dueDate.getTime() < Date.now()
    ) {
      return { ...d, status: 'overdue' as const };
    }
    return d;
  }
}
