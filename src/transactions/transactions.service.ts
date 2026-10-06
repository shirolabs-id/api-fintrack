import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTransactionDto,
  FindTransactionsQueryDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';

const LIST_SELECT = {
  id: true,
  type: true,
  amount: true,
  date: true,
  accountId: true,
  toAccountId: true,
  categoryId: true,
  description: true,
  merchant: true,
  tags: true,
  notes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  account: { select: { name: true } },
  toAccount: { select: { name: true } },
  category: { select: { name: true, icon: true, color: true } },
} satisfies Prisma.TransactionSelect;

type TransactionWithRelations = Prisma.TransactionGetPayload<{ select: typeof LIST_SELECT }>;

/** Shape response to match the frontend contract (flat accountName/categoryName fields). */
function toContract(t: TransactionWithRelations) {
  return {
    id: t.id,
    type: t.type,
    amount: t.amount,
    date: t.date,
    accountId: t.accountId,
    accountName: t.account.name,
    toAccountId: t.toAccountId,
    toAccountName: t.toAccount?.name,
    categoryId: t.categoryId,
    categoryName: t.category?.name,
    categoryIcon: t.category?.icon,
    categoryColor: t.category?.color,
    description: t.description,
    merchant: t.merchant,
    tags: t.tags,
    notes: t.notes,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, q: FindTransactionsQueryDto) {
    const page = q.page ?? 1;
    const limit = Math.min(q.limit ?? 20, 100);
    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(q.type && q.type !== 'all' ? { type: q.type } : {}),
      ...(q.accountId ? { accountId: q.accountId } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.startDate || q.endDate
        ? { date: { ...(q.startDate ? { gte: new Date(q.startDate) } : {}), ...(q.endDate ? { lte: new Date(q.endDate) } : {}) } }
        : {}),
      ...(q.minAmount !== undefined || q.maxAmount !== undefined
        ? { amount: { ...(q.minAmount !== undefined ? { gte: q.minAmount } : {}), ...(q.maxAmount !== undefined ? { lte: q.maxAmount } : {}) } }
        : {}),
      ...(q.search
        ? {
            OR: [
              { description: { contains: q.search, mode: 'insensitive' } },
              { merchant: { contains: q.search, mode: 'insensitive' } },
              { notes: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        select: LIST_SELECT,
        orderBy: { [q.sortBy ?? 'date']: q.sortOrder ?? 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: rows.map(toContract),
      meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    };
  }

  async findOne(userId: string, id: string) {
    const t = await this.prisma.transaction.findFirst({ where: { id, userId }, select: LIST_SELECT });
    if (!t) throw new NotFoundException('Transaksi tidak ditemukan');
    return toContract(t);
  }

  async create(userId: string, dto: CreateTransactionDto) {
    this.validateReferences(userId, dto.accountId, dto.toAccountId, dto.categoryId, dto.type);

    const trx = await this.prisma.transaction.create({
      data: {
        userId,
        type: dto.type,
        amount: dto.amount,
        date: new Date(dto.date),
        accountId: dto.accountId,
        toAccountId: dto.type === 'transfer' ? dto.toAccountId : null,
        categoryId: dto.type === 'transfer' ? null : dto.categoryId,
        description: dto.description,
        merchant: dto.merchant,
        tags: dto.tags ?? [],
        notes: dto.notes,
        attachmentUrl: dto.attachmentUrl,
      },
      select: LIST_SELECT,
    });
    return toContract(trx);
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    const existing = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Transaksi tidak ditemukan');

    const type = dto.type ?? existing.type;
    this.validateReferences(
      userId,
      dto.accountId ?? existing.accountId,
      dto.toAccountId ?? existing.toAccountId ?? undefined,
      dto.categoryId ?? existing.categoryId ?? undefined,
      type,
    );

    const t = await this.prisma.transaction.update({
      where: { id },
      data: {
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.date ? { date: new Date(dto.date) } : {}),
        ...(dto.accountId ? { accountId: dto.accountId } : {}),
        ...(dto.toAccountId !== undefined ? { toAccountId: type === 'transfer' ? dto.toAccountId : null } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: type === 'transfer' ? null : dto.categoryId } : {}),
        ...(dto.description ? { description: dto.description } : {}),
        ...(dto.merchant !== undefined ? { merchant: dto.merchant } : {}),
        ...(dto.tags ? { tags: dto.tags } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
      select: LIST_SELECT,
    });
    return toContract(t);
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Transaksi tidak ditemukan');
    await this.prisma.transaction.delete({ where: { id } });
    return { message: 'Transaksi dihapus' };
  }

  private validateReferences(
    userId: string,
    accountId: string,
    toAccountId: string | undefined,
    categoryId: string | undefined,
    type: 'income' | 'expense' | 'transfer',
  ) {
    if (type === 'transfer' && !toAccountId) {
      throw new BadRequestException('Transfer memerlukan toAccountId');
    }
    if (type !== 'transfer' && toAccountId) {
      throw new BadRequestException('toAccountId hanya untuk transfer');
    }
    if (type !== 'transfer' && !categoryId) {
      throw new BadRequestException('Kategori wajib untuk income/expense');
    }
    if (toAccountId && toAccountId === accountId) {
      throw new BadRequestException('Rekening tujuan tidak boleh sama');
    }
    // Ownership checks (throws if not owned / not found).
    this.ownAccountOrThrow(userId, accountId);
    if (toAccountId) this.ownAccountOrThrow(userId, toAccountId);
    if (categoryId) this.ownCategoryOrThrow(userId, categoryId);
  }

  private async ownAccountOrThrow(userId: string, accountId: string) {
    const acc = await this.prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!acc) throw new BadRequestException('Rekening tidak ditemukan');
  }

  private async ownCategoryOrThrow(userId: string, categoryId: string) {
    const cat = await this.prisma.category.findFirst({ where: { id: categoryId, userId } });
    if (!cat) throw new BadRequestException('Kategori tidak ditemukan');
  }
}
