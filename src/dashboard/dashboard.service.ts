import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { RecurringService, nextOccurrence } from '../recurring/recurring.service';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private accounts: AccountsService,
    private recurring: RecurringService,
  ) {}

  /**
   * Aggregates the dashboard payload. Queries are deliberately few and the
   * relation lookups (account/category names) are joined in memory from data
   * already fetched — on a remote database every extra query costs a full
   * round trip, and Prisma issues a separate query per included relation.
   */
  async getDashboard(userId: string) {
    // Execute due recurring schedules first so aggregates are fresh.
    await this.recurring.runDue(userId);

    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

    const [
      accounts,
      flowRows,
      expenseRows,
      categories,
      budgets,
      savingGoals,
      upcomingRecurrings,
      upcomingDebts,
      recent,
    ] = await Promise.all([
      // includeArchived: recent transactions may reference an archived account,
      // and we need its name for the label (totalBalance filters it out below).
      this.accounts.findAll(userId, true),
      // One query for both the 6-month chart and this month's income/expense.
      this.prisma.$queryRaw<{ month: string; type: string; total: bigint }[]>`
        SELECT to_char(date, 'YYYY-MM') AS month, type::text AS type, SUM(amount) AS total
        FROM "Transaction"
        WHERE "userId" = ${userId} AND status = 'completed' AND date >= ${sixMonthsAgo}
        GROUP BY 1, 2 ORDER BY 1`,
      this.prisma.transaction.groupBy({
        by: ['categoryId'],
        where: {
          userId,
          type: 'expense',
          status: 'completed',
          date: { gte: monthStart, lt: nextMonth },
          categoryId: { not: null },
        },
        _sum: { amount: true },
      }),
      // Serves both the expense breakdown and the budget rows (no per-relation query).
      this.prisma.category.findMany({
        where: { userId },
        select: { id: true, name: true, icon: true, color: true },
      }),
      this.prisma.budget.findMany({ where: { userId, period: monthKey }, take: 4 }),
      this.prisma.savingGoal.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, take: 2 }),
      this.prisma.recurring.findMany({
        where: { userId, isActive: true },
        orderBy: { dayOfMonth: 'asc' },
        take: 4,
      }),
      this.prisma.debt.findMany({
        where: { userId, status: { not: 'paid' } },
        orderBy: { dueDate: 'asc' },
        take: 4,
      }),
      this.prisma.transaction.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        take: 6,
      }),
    ]);

    const byMonthType = (month: string, type: string) =>
      Number(flowRows.find((r) => r.month === month && r.type === type)?.total ?? 0);

    // totalBalance = sum of currentBalance across non-credit-card, non-archived accounts
    const totalBalance = accounts
      .filter((a) => a.type !== 'credit_card' && !a.isArchived)
      .reduce((sum, a) => sum + a.currentBalance, 0);

    const totalIncome = byMonthType(monthKey, 'income');
    const totalExpense = byMonthType(monthKey, 'expense');

    const cashFlowOverview = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const income = byMonthType(key, 'income');
      const expense = byMonthType(key, 'expense');
      return { month: MONTH_NAMES[d.getUTCMonth()], income, expense, net: income - expense };
    });

    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));

    // Expense by category this month
    const spentByCategory = new Map(
      expenseRows.map((r) => [r.categoryId as string, r._sum.amount ?? 0]),
    );
    const totalCatExpense = [...spentByCategory.values()].reduce((s, v) => s + v, 0) || 1;
    const expenseByCategory = [...spentByCategory.entries()]
      .map(([categoryId, amount]) => {
        const category = categoryById.get(categoryId);
        return {
          categoryId,
          categoryName: category?.name ?? 'Tanpa kategori',
          color: category?.color ?? '#71717a',
          amount,
          percentage: Math.round((amount / totalCatExpense) * 100),
        };
      })
      .sort((a, b) => b.amount - a.amount);

    // Budget rows with spent from this month's category totals
    const budgetsDto = budgets
      .map((b) => {
        const category = categoryById.get(b.categoryId);
        if (!category) return null; // category deleted — skip rather than render a broken row
        const spent = spentByCategory.get(b.categoryId) ?? 0;
        return {
          id: b.id,
          categoryId: b.categoryId,
          categoryName: category.name,
          categoryIcon: category.icon,
          categoryColor: category.color,
          period: b.period,
          amount: b.amount,
          spent,
          remaining: b.amount - spent,
          percentage: b.amount > 0 ? Math.round((spent / b.amount) * 1000) / 10 : 0,
          isRollover: b.isRollover,
        };
      })
      .filter((b) => b !== null);

    const upcomingItems = [
      ...upcomingRecurrings.map((r) => ({
        id: r.id,
        type: 'recurring' as const,
        title: r.name,
        amount: r.amount,
        dueDate: nextOccurrence(r),
        subtitle: `Setiap ${r.dayOfMonth ? `tanggal ${r.dayOfMonth}` : 'periode'}`,
        isExpense: r.type === 'expense',
      })),
      ...upcomingDebts
        .filter((d) => d.dueDate)
        .map((d) => ({
          id: d.id,
          type: d.type === 'debt' ? ('debt_due' as const) : ('receivable_due' as const),
          title: `${d.type === 'debt' ? 'Hutang ke' : 'Piutang dari'} ${d.personName}`,
          amount: d.remainingAmount,
          dueDate: d.dueDate as Date,
          subtitle: d.description || 'Jatuh tempo',
          isExpense: d.type === 'debt',
        })),
    ]
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 4);

    return {
      totalBalance,
      totalIncome,
      totalExpense,
      cashFlow: totalIncome - totalExpense,
      chartPeriod: 'Bulan Ini',
      cashFlowOverview,
      expenseByCategory,
      budgets: budgetsDto,
      savingGoals,
      upcomingItems,
      recentTransactions: recent.map((t) => {
        const category = t.categoryId ? categoryById.get(t.categoryId) : undefined;
        return {
          id: t.id,
          type: t.type,
          amount: t.amount,
          date: t.date,
          accountId: t.accountId,
          accountName: accountNameById.get(t.accountId),
          toAccountId: t.toAccountId,
          toAccountName: t.toAccountId ? accountNameById.get(t.toAccountId) : undefined,
          categoryId: t.categoryId,
          categoryName: category?.name,
          categoryIcon: category?.icon,
          categoryColor: category?.color,
          description: t.description,
          merchant: t.merchant,
          tags: t.tags,
          notes: t.notes,
          status: t.status,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        };
      }),
    };
  }
}
