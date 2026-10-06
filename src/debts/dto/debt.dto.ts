import {
  IsString,
  IsEnum,
  IsInt,
  IsOptional,
  IsDateString,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateDebtDto {
  @IsEnum(['debt', 'receivable'])
  type: 'debt' | 'receivable';

  @IsString()
  @MaxLength(100)
  personName: string;

  @IsInt()
  @Min(1)
  totalAmount: number;

  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class UpdateDebtDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  personName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  totalAmount?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsEnum(['active', 'partially_paid', 'paid', 'overdue'])
  status?: 'active' | 'partially_paid' | 'paid' | 'overdue';
}

export class RecordDebtPaymentDto {
  @IsInt()
  @Min(1)
  amount: number;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
