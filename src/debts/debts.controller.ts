import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { DebtsService } from './debts.service';
import { CreateDebtDto, UpdateDebtDto, RecordDebtPaymentDto } from './dto/debt.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('debts')
export class DebtsController {
  constructor(private debts: DebtsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('type') type?: 'debt' | 'receivable',
    @Query('status') status?: string,
  ) {
    return this.debts.findAll(user.userId, type, status);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.debts.findOne(user.userId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDebtDto) {
    return this.debts.create(user.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDebtDto) {
    return this.debts.update(user.userId, id, dto);
  }

  @Post(':id/payments')
  recordPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RecordDebtPaymentDto,
  ) {
    return this.debts.recordPayment(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.debts.remove(user.userId, id);
  }
}
