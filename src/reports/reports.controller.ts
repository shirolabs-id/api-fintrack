import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsIn, IsDateString } from 'class-validator';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

export class ReportQueryDto {
  @IsIn(['this_month', '3_months', '6_months', 'this_year', 'custom'])
  period: 'this_month' | '3_months' | '6_months' | 'this_year' | 'custom';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query() query: ReportQueryDto) {
    return this.reports.summary(user.userId, query.period, query.startDate, query.endDate);
  }
}
