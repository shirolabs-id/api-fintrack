import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateBudgetDto {
  @IsString()
  categoryId: string;

  /** YYYY-MM */
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsOptional()
  isRollover?: boolean;
}

export class UpdateBudgetDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsOptional()
  isRollover?: boolean;
}
