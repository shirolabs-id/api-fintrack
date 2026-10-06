import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Shape rows to the frontend contract (createdAt → date). */
function toContract(n: {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: Date;
}) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    date: n.createdAt,
    isRead: n.isRead,
    link: n.link ?? undefined,
  };
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    // Regenerate insight-based notifications (budget thresholds, due dates,
    // upcoming recurring) before listing, so the list is always current.
    await this.generateInsights(userId);

    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map(toContract);
  }

  async markAsRead(userId: string, id: string) {
    const notif = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!notif) {
      await this.prisma.notification.deleteMany({ where: { id, userId } });
      return { message: 'Notifikasi tidak ditemukan' };
    }
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
    return toContract(updated);
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { success: true };
  }

  /**
   * Upserts derived notifications for the current state:
   * - budget usage >= 80% (warning) / >= 100% (exceeded)
   * - debts/receivables due within 7 days or overdue
   * - recurring transactions due within 3 days
   * Old derived rows for the same key are replaced; read state resets on change.
   */
  private async generateInsights(userId: string) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const weekAhead = new Date(now.getTime() + 7 * 86400000);
    const threeDaysAhead = new Date(now.getTime() + 3 * 86400000);

    const [budgets, expenses, dueDebts, dueRecurrings] = await Promise.all([
      this.prisma.budget.findMany({
        where: { userId, period },
        include: { category: { select: { name: true } } },
      }),
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
      this.prisma.debt.findMany({
        where: { userId, status: { not: 'paid' }, dueDate: { not: null, lte: weekAhead } },
      }),
      this.prisma.recurring.findMany({ where: { userId, isActive: true } }),
    ]);

    const spentByCategory = new Map(
      expenses.map((e) => [e.categoryId as string, e._sum.amount ?? 0]),
    );

    type Insight = {
      key: string;
      type: string;
      title: string;
      message: string;
      link?: string;
    };
    const insights: Insight[] = [];

    for (const b of budgets) {
      const spent = spentByCategory.get(b.categoryId) ?? 0;
      const pct = b.amount > 0 ? (spent / b.amount) * 100 : 0;
      if (pct >= 100) {
        insights.push({
          key: `budget_exceeded:${b.id}`,
          type: 'budget_exceeded',
          title: `Anggaran Terlampaui: ${b.category.name}`,
          message: `Pengeluaran kategori ${b.category.name} telah melampaui limit anggaran (${Math.round(pct)}%).`,
          link: '/budgets',
        });
      } else if (pct >= 80) {
        insights.push({
          key: `budget_warning:${b.id}`,
          type: 'budget_warning',
          title: `Peringatan Anggaran: ${b.category.name}`,
          message: `Pengeluaran kategori ${b.category.name} telah mencapai ${Math.round(pct)}% dari limit anggaran.`,
          link: '/budgets',
        });
      }
    }

    for (const d of dueDebts) {
      const overdue = d.dueDate && d.dueDate.getTime() < now.getTime();
      const label = d.type === 'debt' ? 'Hutang ke' : 'Piutang dari';
      insights.push({
        key: `debt_due:${d.id}:${overdue ? 'overdue' : 'upcoming'}`,
        type: d.type === 'debt' ? 'debt_due' : 'receivable_due',
        title: overdue
          ? `${label} ${d.personName} Jatuh Tempo`
          : `${label} ${d.personName} Mendekati Jatuh Tempo`,
        message: `${label} ${d.personName} sebesar Rp ${d.remainingAmount.toLocaleString('id-ID')} ${overdue ? 'telah melewati' : 'akan jatuh tempo pada'} tanggal ${d.dueDate?.toISOString().slice(0, 10)}.`,
        link: '/debts',
      });
    }

    for (const r of dueRecurrings) {
      if (r.frequency !== 'monthly' || !r.dayOfMonth) continue;
      let due = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), r.dayOfMonth));
      if (due < now) due = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, r.dayOfMonth));
      if (due > threeDaysAhead) continue;
      insights.push({
        key: `recurring_upcoming:${r.id}:${due.toISOString().slice(0, 10)}`,
        type: 'recurring_upcoming',
        title: 'Transaksi Berulang Mendatang',
        message: `${r.name} Rp ${r.amount.toLocaleString('id-ID')} dijadwalkan pada ${due.toISOString().slice(0, 10)}.`,
        link: '/recurring',
      });
    }

    // Replace derived rows in one pass; keep user-read rows of the same key read-state.
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.notification.findMany({
        where: { userId, type: { not: 'system' } },
        select: { id: true, type: true, title: true, isRead: true },
      });
      const existingByTypeTitle = new Map(existing.map((n) => [`${n.type}|${n.title}`, n]));

      for (const i of insights) {
        const match = existingByTypeTitle.get(`${i.type}|${i.title}`);
        if (match) {
          await tx.notification.update({
            where: { id: match.id },
            data: { message: i.message, link: i.link },
          });
          existingByTypeTitle.delete(`${i.type}|${i.title}`);
        } else {
          await tx.notification.create({
            data: {
              userId,
              type: i.type,
              title: i.title,
              message: i.message,
              link: i.link,
            },
          });
        }
      }
      // Rows that no longer correspond to any insight are stale — remove them.
      await tx.notification.deleteMany({
        where: { id: { in: [...existingByTypeTitle.values()].map((n) => n.id) } },
      });
    });
  }
}
