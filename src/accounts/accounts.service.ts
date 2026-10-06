import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/account.dto';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, includeArchived = false) {
    const accounts = await this.prisma.account.findMany({
      where: { userId, ...(includeArchived ? {} : { isArchived: false }) },
      orderBy: { createdAt: 'asc' },
    });
    const balances = await this.balanceMap(userId, accounts);
    return accounts.map((a) => ({ ...a, currentBalance: balances.get(a.id) ?? a.openingBalance }));
  }

  async findOne(userId: string, id: string) {
    const account = await this.prisma.account.findFirst({ where: { id, userId } });
    if (!account) throw new NotFoundException('Rekening tidak ditemukan');
    const balances = await this.balanceMap(userId, [account]);
    return { ...account, currentBalance: balances.get(account.id) ?? account.openingBalance };
  }

  async create(userId: string, dto: CreateAccountDto) {
    return this.prisma.account.create({ data: { ...dto, userId } });
  }

  async update(userId: string, id: string, dto: Partial<CreateAccountDto> & { isArchived?: boolean }) {
    await this.findOne(userId, id);
    return this.prisma.account.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    const trxCount = await this.prisma.transaction.count({ where: { accountId: id } });
    if (trxCount > 0) {
      throw new BadRequestException(
        'Rekening sudah memiliki transaksi; gunakan arsip (archive) sebagai gantinya',
      );
    }
    await this.prisma.account.delete({ where: { id } });
    return { message: 'Rekening dihapus' };
  }

  /**
   * currentBalance = openingBalance + income - expense + transferIn - transferOut
   *
   * Done as a single grouped query for all requested accounts (was 4 aggregates
   * per account, which cost 4×N round trips on remote databases).
   */
  private async balanceMap(
    userId: string,
    accounts: { id: string; openingBalance: number }[],
  ): Promise<Map<string, number>> {
    const balances = new Map(accounts.map((a) => [a.id, a.openingBalance]));
    if (accounts.length === 0) return balances;

    const ids = accounts.map((a) => a.id);
    const rows = await this.prisma.transaction.groupBy({
      by: ['type', 'accountId', 'toAccountId'],
      where: {
        userId,
        status: 'completed',
        OR: [{ accountId: { in: ids } }, { toAccountId: { in: ids } }],
      },
      _sum: { amount: true },
    });

    const apply = (accountId: string | null, delta: number) => {
      if (!accountId || !balances.has(accountId)) return;
      balances.set(accountId, balances.get(accountId)! + delta);
    };

    for (const row of rows) {
      const amount = row._sum.amount ?? 0;
      if (row.type === 'income') {
        apply(row.accountId, amount);
      } else if (row.type === 'expense') {
        apply(row.accountId, -amount);
      } else if (row.type === 'transfer') {
        apply(row.accountId, -amount);
        apply(row.toAccountId, amount);
      }
    }
    return balances;
  }
}
