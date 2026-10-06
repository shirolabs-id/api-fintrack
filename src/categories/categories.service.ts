import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, type?: 'income' | 'expense') {
    const categories = await this.prisma.category.findMany({
      where: { userId, ...(type ? { type } : {}) },
      orderBy: { name: 'asc' },
      include: {
        children: { orderBy: { name: 'asc' }, select: { id: true, name: true, parentId: true } },
      },
    });
    // Return only top-level; children are nested.
    return categories.filter((c) => !c.parentId);
  }

  async create(userId: string, dto: CreateCategoryDto) {
    if (dto.parentId) {
      const parent = await this.prisma.category.findFirst({ where: { id: dto.parentId, userId } });
      if (!parent) throw new BadRequestException('Kategori induk tidak ditemukan');
    }
    return this.prisma.category.create({
      data: {
        name: dto.name,
        type: dto.type,
        icon: dto.icon,
        color: dto.color,
        parentId: dto.parentId,
        userId,
      },
      include: {
        children: { orderBy: { name: 'asc' }, select: { id: true, name: true, parentId: true } },
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findFirst({ where: { id, userId } });
    if (!category) throw new NotFoundException('Kategori tidak ditemukan');
    if (dto.parentId && dto.parentId === id) {
      throw new BadRequestException('Kategori tidak boleh menjadi induk dirinya sendiri');
    }
    if (dto.parentId) {
      const parent = await this.prisma.category.findFirst({ where: { id: dto.parentId, userId } });
      if (!parent) throw new BadRequestException('Kategori induk tidak ditemukan');
    }
    return this.prisma.category.update({
      where: { id },
      data: dto,
      include: {
        children: { orderBy: { name: 'asc' }, select: { id: true, name: true, parentId: true } },
      },
    });
  }

  async remove(userId: string, id: string) {
    const category = await this.prisma.category.findFirst({ where: { id, userId } });
    if (!category) throw new NotFoundException('Kategori tidak ditemukan');
    if (category.isSystem) throw new BadRequestException('Kategori sistem tidak dapat dihapus');
    const trxCount = await this.prisma.transaction.count({ where: { categoryId: id } });
    if (trxCount > 0) {
      throw new BadRequestException('Kategori masih digunakan oleh transaksi');
    }
    await this.prisma.category.delete({ where: { id } });
    return { message: 'Kategori dihapus' };
  }
}
