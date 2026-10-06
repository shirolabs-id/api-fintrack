import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';

type Period = 'this_month' | '3_months' | '6_months' | 'this_year' | 'custom';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function resolveRange(period: Period, startDate?: string, endDate?: string) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  switch (period) {
    case 'this_month':
      return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)) };
    case '3_months':
      return { start: new Date(Date.UTC(y, m - 2, 1)), end: new Date(Date.UTC(y, m + 1, 1)) };
    case '6_months':
      return { start: new Date(Date.UTC(y, m - 5, 1)), end: new Date(Date.UTC(y, m + 1, 1)) };
    case 'this_year':
      return { start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y + 1, 0, 1)) };
    case 'custom':
    default:
      return {
        start: startDate ? new Date(startDate) : new Date(Date.UTC(y, m, 1)),
        end: endDate ? new Date(endDate) : new Date(Date.UTC(y, m + 1, 1)),
      };
  }
}

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private accounts: AccountsService,
  ) {}

  async summary(userId: string, period: Period, startDate?: string, endDate?: string) {
    const { start, end } = resolveRange(period, startDate, endDate);

    const [typeSums, catRows, accounts, activeDebts] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['type'],
        where: { userId, status: 'completed', date: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['type', 'categoryId'],
        where: {
          userId,
          status: 'completed',
          categoryId: { not: null },
          date: { gte: start, lt: end },
        },
        _sum: { amount: true },
      }),
      this.accounts.findAll(userId, true), // includeArchived: net worth counts everything
      this.prisma.debt.findMany({ where: { userId, status: { not: 'paid' } } }),
    ]);

    const sumOf = (type: string) =>
      typeSums.find((r) => r.type === type)?._sum.amount ?? 0;
    const totalIncome = sumOf('income');
    const totalExpense = sumOf('expense');

    const catIds = [...new Set(catRows.map((r) => r.categoryId as string))];
    const categories = catIds.length
      ? await this.prisma.category.findMany({
          where: { id: { in: catIds } },
          select: { id: true, name: true, color: true },
        })
      : [];
    const catById = new Map(categories.map((c) => [c.id, c]));

    const buildBreakdown = (type: 'income' | 'expense') => {
      const rows = catRows.filter((r) => r.type === type);
      const total = rows.reduce((s, r) => s + (r._sum.amount ?? 0), 0) || 1;
      return rows
        .map((r) => {
          const cat = catById.get(r.categoryId as string);
          const amount = r._sum.amount ?? 0;
          return {
            categoryId: r.categoryId as string,
            categoryName: cat?.name ?? 'Tanpa kategori',
            color: cat?.color ?? '#71717a',
            amount,
            percentage: Math.round((amount / total) * 1000) / 10,
          };
        })
        .sort((a, b) => b.amount - a.amount);
    };

    // Cash flow history: one row per month (or per day if range < 62 days)
    const rangeDays = (end.getTime() - start.getTime()) / 86400000;
    const cashFlowHistory =
      rangeDays <= 62
        ? await this.dailyCashFlow(userId, start, end)
        : await this.monthlyCashFlow(userId, start, end);

    // Net worth: assets = non-credit-card balances; liabilities = credit-card
    // (negative) balances + outstanding debts I owe.
    const assets = accounts.filter((a) => a.type !== 'credit_card');
    const creditCards = accounts.filter((a) => a.type === 'credit_card');
    const ccDebt = creditCards.reduce((s, a) => s + Math.max(-a.currentBalance, 0), 0);
    const outstandingDebt = activeDebts
      .filter((d) => d.type === 'debt')
      .reduce((s, d) => s + d.remainingAmount, 0);
    const receivables = activeDebts
      .filter((d) => d.type === 'receivable')
      .reduce((s, d) => s + d.remainingAmount, 0);
    const totalAssets = assets.reduce((s, a) => s + Math.max(a.currentBalance, 0), 0) + receivables;
    const totalLiabilities = ccDebt + outstandingDebt;

    const assetsBreakdown = [
      ...assets
        .filter((a) => a.currentBalance > 0)
        .map((a) => ({ category: a.name, amount: a.currentBalance })),
      { category: 'Piutang', amount: receivables },
    ].filter((row) => row.amount > 0);

    const liabilitiesBreakdown = [
      ...creditCards
        .filter((a) => a.currentBalance < 0)
        .map((a) => ({ category: a.name, amount: Math.abs(a.currentBalance) })),
      ...activeDebts
        .filter((d) => d.type === 'debt' && d.remainingAmount > 0)
        .map((d) => ({ category: d.personName, amount: d.remainingAmount })),
    ];

    return {
      period,
      totalIncome,
      totalExpense,
      netCashFlow: totalIncome - totalExpense,
      savingsRate:
        totalIncome > 0
          ? Math.round(((totalIncome - totalExpense) / totalIncome) * 1000) / 10
          : 0,
      cashFlowHistory,
      expenseByCategory: buildBreakdown('expense'),
      incomeByCategory: buildBreakdown('income'),
      netWorth: {
        totalAssets,
        totalLiabilities,
        netWorth: totalAssets - totalLiabilities,
        assetsBreakdown,
        liabilitiesBreakdown,
      },
    };
  }

  private async monthlyCashFlow(userId: string, start: Date, end: Date) {
    const rows = await this.prisma.$queryRaw<{ month: string; type: string; total: bigint }[]>`
      SELECT to_char(date, 'YYYY-MM') AS month, type::text AS type, SUM(amount) AS total
      FROM "Transaction"
      WHERE "userId" = ${userId} AND status = 'completed' AND date >= ${start} AND date < ${end}
      GROUP BY 1, 2 ORDER BY 1`;

    const history: { month: string; income: number; expense: number; net: number }[] = [];
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cursor < end) {
      const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
      const income = Number(rows.find((r) => r.month === key && r.type === 'income')?.total ?? 0);
      const expense = Number(rows.find((r) => r.month === key && r.type === 'expense')?.total ?? 0);
      history.push({
        month: `${MONTH_SHORT[cursor.getUTCMonth()]} ${String(cursor.getUTCFullYear()).slice(2)}`,
        income,
        expense,
        net: income - expense,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return history;
  }

  private async dailyCashFlow(userId: string, start: Date, end: Date) {
    const rows = await this.prisma.$queryRaw<{ day: string; type: string; total: bigint }[]>`
      SELECT to_char(date, 'YYYY-MM-DD') AS day, type::text AS type, SUM(amount) AS total
      FROM "Transaction"
      WHERE "userId" = ${userId} AND status = 'completed' AND date >= ${start} AND date < ${end}
      GROUP BY 1, 2 ORDER BY 1`;

    const history: { month: string; income: number; expense: number; net: number }[] = [];
    const cursor = new Date(start);
    while (cursor < end) {
      const key = cursor.toISOString().slice(0, 10);
      const income = Number(rows.find((r) => r.day === key && r.type === 'income')?.total ?? 0);
      const expense = Number(rows.find((r) => r.day === key && r.type === 'expense')?.total ?? 0);
      history.push({
        month: `${cursor.getUTCDate()} ${MONTH_SHORT[cursor.getUTCMonth()]}`,
        income,
        expense,
        net: income - expense,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return history;
  }
}
