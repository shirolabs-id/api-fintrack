import {
  IsString,
  IsEnum,
  IsInt,
  IsOptional,
  IsDateString,
  IsBoolean,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateRecurringDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsEnum(['income', 'expense', 'transfer'])
  type: 'income' | 'expense' | 'transfer';

  @IsInt()
  @Min(1)
  amount: number;

  @IsEnum(['daily', 'weekly', 'monthly', 'yearly'])
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsString()
  accountId: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}

export class UpdateRecurringDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(['income', 'expense', 'transfer'])
  type?: 'income' | 'expense' | 'transfer';

  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsEnum(['daily', 'weekly', 'monthly', 'yearly'])
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
