import {
  IsString,
  IsEnum,
  IsInt,
  IsOptional,
  IsDateString,
  IsArray,
  Min,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';

export class CreateTransactionDto {
  @IsEnum(['income', 'expense', 'transfer'])
  type: 'income' | 'expense' | 'transfer';

  @IsInt()
  @Min(1)
  amount: number;

  @IsDateString()
  date: string;

  @IsString()
  accountId: string;

  @IsOptional()
  @IsString()
  toAccountId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsString()
  @MaxLength(255)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  merchant?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}

export class UpdateTransactionDto {
  @IsOptional()
  @IsEnum(['income', 'expense', 'transfer'])
  type?: 'income' | 'expense' | 'transfer';

  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  toAccountId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  merchant?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsEnum(['completed', 'pending', 'cancelled'])
  status?: 'completed' | 'pending' | 'cancelled';
}

export class FindTransactionsQueryDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  search?: string;

  @IsOptional()
  type?: 'income' | 'expense' | 'transfer' | 'all';

  @IsOptional()
  accountId?: string;

  @IsOptional()
  categoryId?: string;

  @IsOptional()
  startDate?: string;

  @IsOptional()
  endDate?: string;

  @IsOptional()
  minAmount?: number;

  @IsOptional()
  maxAmount?: number;

  @IsOptional()
  sortBy?: 'date' | 'amount' | 'createdAt';

  @IsOptional()
  sortOrder?: 'asc' | 'desc';
}
