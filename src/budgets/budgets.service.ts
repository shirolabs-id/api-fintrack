import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBudgetDto, UpdateBudgetDto } from './dto/budget.dto';

function periodRange(period: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1)); // exclusive
  return { start, end };
}

@Injectable()
export class BudgetsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, period: string) {
    const { start, end } = periodRange(period);
    const budgets = await this.prisma.budget.findMany({
      where: { userId, period },
      orderBy: { createdAt: 'asc' },
      include: { category: { select: { name: true, icon: true, color: true } } },
    });

    // Aggregate actual expense per category for the period in one query.
    const expenses = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type: 'expense',
        status: 'completed',
        categoryId: { not: null },
        date: { gte: start, lt: end },
      },
      _sum: { amount: true },
    });
    const spentByCategory = new Map(
      expenses.map((e) => [e.categoryId as string, e._sum.amount ?? 0]),
    );

    return budgets.map((b) => {
      const spent = spentByCategory.get(b.categoryId) ?? 0;
      const remaining = b.amount - spent;
      return {
        id: b.id,
        categoryId: b.categoryId,
        categoryName: b.category.name,
        categoryIcon: b.category.icon,
        categoryColor: b.category.color,
        period: b.period,
        amount: b.amount,
        spent,
        remaining,
        percentage: b.amount > 0 ? Math.round((spent / b.amount) * 1000) / 10 : 0,
        isRollover: b.isRollover,
      };
    });
  }

  async create(userId: string, dto: CreateBudgetDto) {
    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, userId },
    });
    if (!category) throw new NotFoundException('Kategori tidak ditemukan');
    if (category.type !== 'expense') {
      throw new ConflictException('Anggaran hanya untuk kategori pengeluaran');
    }
    const dup = await this.prisma.budget.findFirst({
      where: { userId, categoryId: dto.categoryId, period: dto.period },
    });
    if (dup) throw new ConflictException('Anggaran untuk kategori & periode ini sudah ada');

    return this.prisma.budget.create({
      data: {
        userId,
        categoryId: dto.categoryId,
        period: dto.period,
        amount: dto.amount,
        isRollover: dto.isRollover ?? false,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateBudgetDto) {
    const budget = await this.prisma.budget.findFirst({ where: { id, userId } });
    if (!budget) throw new NotFoundException('Anggaran tidak ditemukan');
    return this.prisma.budget.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    const budget = await this.prisma.budget.findFirst({ where: { id, userId } });
    if (!budget) throw new NotFoundException('Anggaran tidak ditemukan');
    await this.prisma.budget.delete({ where: { id } });
    return { message: 'Anggaran dihapus' };
  }
}
