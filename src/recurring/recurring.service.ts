import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRecurringDto, UpdateRecurringDto } from './dto/recurring.dto';

const RECURRING_SELECT = {
  id: true,
  name: true,
  type: true,
  amount: true,
  frequency: true,
  dayOfMonth: true,
  dayOfWeek: true,
  startDate: true,
  endDate: true,
  lastRunDate: true,
  isActive: true,
  accountId: true,
  categoryId: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  account: { select: { name: true } },
  category: { select: { name: true } },
} satisfies Prisma.RecurringSelect;

type RecurringRow = Prisma.RecurringGetPayload<{ select: typeof RECURRING_SELECT }>;

type ScheduleRules = {
  frequency: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  startDate: Date;
};

const DAY_MS = 86400000;

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function endOfTodayUtc(): Date {
  const d = startOfDayUtc(new Date());
  return new Date(d.getTime() + DAY_MS - 1);
}

/** First occurrence of the schedule, never before startDate. */
function firstOccurrence(r: ScheduleRules): Date {
  const start = startOfDayUtc(r.startDate);
  if (r.frequency === 'monthly') {
    const day = r.dayOfMonth ?? start.getUTCDate();
    const candidate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day));
    return candidate < start ? monthAfter(start, day, 1) : candidate;
  }
  if (r.frequency === 'weekly' && r.dayOfWeek !== null) {
    const shift = (r.dayOfWeek - start.getUTCDay() + 7) % 7;
    return new Date(start.getTime() + shift * DAY_MS);
  }
  return start; // daily, yearly, weekly without dayOfWeek
}

/** One period after `d`, clamping monthly days to the month length (Jan 31 → Feb 28). */
function stepOnce(r: ScheduleRules, d: Date): Date {
  if (r.frequency === 'daily') return new Date(d.getTime() + DAY_MS);
  if (r.frequency === 'weekly') return new Date(d.getTime() + 7 * DAY_MS);
  if (r.frequency === 'yearly') {
    return new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
  }
  return monthAfter(d, r.dayOfMonth ?? d.getUTCDate(), 1);
}

function monthAfter(from: Date, day: number, months: number): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, lastDay)));
}

/**
 * Next occurrence strictly after `after` (default: now), accounting for
 * lastRunDate so an already-executed occurrence is never returned twice.
 */
export function nextOccurrence(
  r: ScheduleRules & { lastRunDate: Date | null },
  after: Date = new Date(),
): Date {
  const floor = startOfDayUtc(after);
  const last = r.lastRunDate ? startOfDayUtc(r.lastRunDate) : null;
  let d = last ? stepOnce(r, last) : firstOccurrence(r);
  let guard = 0;
  while (d <= floor && guard++ < 10000) d = stepOnce(r, d);
  return d;
}

function toContract(r: RecurringRow) {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    amount: r.amount,
    frequency: r.frequency,
    interval: 1,
    dayOfMonth: r.dayOfMonth,
    dayOfWeek: r.dayOfWeek,
    startDate: r.startDate,
    endDate: r.endDate,
    nextExecutionDate: nextOccurrence(r),
    accountId: r.accountId,
    accountName: r.account.name,
    categoryId: r.categoryId,
    categoryName: r.category?.name,
    isActive: r.isActive,
    notes: r.description,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class RecurringService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    const rows = await this.prisma.recurring.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: RECURRING_SELECT,
    });
    return rows.map(toContract);
  }

  async create(userId: string, dto: CreateRecurringDto) {
    await this.validateRefs(userId, dto.accountId, dto.categoryId, dto.type);

    const created = await this.prisma.recurring.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type,
        amount: dto.amount,
        frequency: dto.frequency,
        dayOfMonth:
          dto.frequency === 'monthly'
            ? (dto.dayOfMonth ?? new Date(dto.startDate).getUTCDate())
            : null,
        dayOfWeek:
          dto.frequency === 'weekly'
            ? (dto.dayOfWeek ?? new Date(dto.startDate).getUTCDay())
            : null,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        accountId: dto.accountId,
        categoryId: dto.type === 'transfer' ? null : (dto.categoryId ?? null),
        isActive: dto.isActive ?? true,
        description: dto.notes,
      },
      select: RECURRING_SELECT,
    });
    return toContract(created);
  }

  async update(userId: string, id: string, dto: UpdateRecurringDto) {
    const existing = await this.prisma.recurring.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Transaksi berulang tidak ditemukan');

    const type = dto.type ?? existing.type;
    await this.validateRefs(userId, dto.accountId ?? existing.accountId, dto.categoryId, type);

    const frequency = dto.frequency ?? existing.frequency;
    // Switching to monthly without an explicit day: derive it from startDate.
    const derivedDayOfMonth =
      frequency === 'monthly' && dto.dayOfMonth === undefined && existing.dayOfMonth === null
        ? existing.startDate.getUTCDate()
        : undefined;

    const updated = await this.prisma.recurring.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.frequency !== undefined ? { frequency: dto.frequency } : {}),
        ...(dto.dayOfMonth !== undefined
          ? { dayOfMonth: dto.dayOfMonth }
          : derivedDayOfMonth !== undefined
            ? { dayOfMonth: derivedDayOfMonth }
            : {}),
        ...(dto.dayOfWeek !== undefined ? { dayOfWeek: dto.dayOfWeek } : {}),
        ...(dto.endDate !== undefined ? { endDate: dto.endDate ? new Date(dto.endDate) : null } : {}),
        ...(dto.accountId ? { accountId: dto.accountId } : {}),
        ...(dto.categoryId !== undefined
          ? { categoryId: type === 'transfer' ? null : dto.categoryId }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.notes !== undefined ? { description: dto.notes } : {}),
      },
      select: RECURRING_SELECT,
    });
    return toContract(updated);
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.recurring.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Transaksi berulang tidak ditemukan');
    await this.prisma.recurring.delete({ where: { id } });
    return { message: 'Transaksi berulang dihapus' };
  }

  /**
   * Backfills every occurrence between lastRunDate (or startDate) and today as a
   * real transaction. Idempotent: it always walks forward from lastRunDate, so
   * repeated calls (GET /recurring, GET /dashboard) never re-create the same
   * occurrence. Called lazily instead of running a cron.
   */
  async runDue(userId: string) {
    const schedules = await this.prisma.recurring.findMany({
      where: { userId, isActive: true },
    });

    const todayStart = startOfDayUtc(new Date());
    const todayEnd = endOfTodayUtc();

    for (const s of schedules) {
      if (s.endDate && startOfDayUtc(s.endDate) < todayStart) continue; // schedule over

      let due = s.lastRunDate ? stepOnce(s, startOfDayUtc(s.lastRunDate)) : firstOccurrence(s);
      let guard = 0;

      while (due <= todayEnd && guard++ < 120) {
        if (s.endDate && due > startOfDayUtc(s.endDate)) break;

        await this.prisma.transaction.create({
          data: {
            userId,
            type: s.type,
            amount: s.amount,
            date: due,
            accountId: s.accountId,
            toAccountId: s.type === 'transfer' ? s.accountId : null,
            categoryId: s.categoryId,
            description: s.description ?? s.name,
            notes: `Otomatis dari jadwal: ${s.name}`,
          },
        });
        await this.prisma.recurring.update({
          where: { id: s.id },
          data: { lastRunDate: due },
        });
        s.lastRunDate = due;
        due = stepOnce(s, due);
      }
    }
  }

  private async validateRefs(
    userId: string,
    accountId: string,
    categoryId: string | undefined,
    type: string,
  ) {
    const acc = await this.prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!acc) throw new BadRequestException('Rekening tidak ditemukan');
    if (categoryId && type !== 'transfer') {
      const cat = await this.prisma.category.findFirst({ where: { id: categoryId, userId } });
      if (!cat) throw new BadRequestException('Kategori tidak ditemukan');
    }
  }
}
