import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

/** Starter categories created for every new user (matches the mock seed set). */
const DEFAULT_CATEGORIES = [
  { name: 'Makanan & Minuman', type: 'expense' as const, icon: 'utensils', color: '#f97316' },
  { name: 'Transportasi', type: 'expense' as const, icon: 'car', color: '#0284c7' },
  { name: 'Tagihan & Utilitas', type: 'expense' as const, icon: 'zap', color: '#eab308' },
  { name: 'Belanja', type: 'expense' as const, icon: 'shopping-bag', color: '#8b5cf6' },
  { name: 'Hiburan', type: 'expense' as const, icon: 'film', color: '#ec4899' },
  { name: 'Kesehatan', type: 'expense' as const, icon: 'activity', color: '#10b981' },
  { name: 'Gaji & Pendapatan Tetap', type: 'income' as const, icon: 'briefcase', color: '#059669' },
  { name: 'Proyek Sampingan', type: 'income' as const, icon: 'laptop', color: '#0284c7' },
  { name: 'Investasi & Dividen', type: 'income' as const, icon: 'trending-up', color: '#8b5cf6' },
];

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email sudah terdaftar');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        categories: {
          create: DEFAULT_CATEGORIES.map((c) => ({ name: c.name, type: c.type, icon: c.icon, color: c.color })),
        },
      },
    });
    return this.issueToken(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email atau password salah');
    }
    return this.issueToken(user);
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.email) {
      const existing = await this.prisma.user.findFirst({
        where: { email: dto.email, id: { not: userId } },
      });
      if (existing) throw new ConflictException('Email sudah digunakan');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
  }

  private issueToken(user: {
    id: string;
    email: string;
    name: string;
    role: string;
    createdAt: Date;
  }) {
    const payload = { sub: user.id, email: user.email };
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
      token: this.jwt.sign(payload),
      expiresIn: 86400,
    };
  }
}
