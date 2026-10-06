import {
  IsString,
  IsEnum,
  IsInt,
  IsOptional,
  IsBoolean,
  Min,
  Max,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsEnum(['cash', 'bank', 'ewallet', 'credit_card', 'investment', 'other'])
  type: 'cash' | 'bank' | 'ewallet' | 'credit_card' | 'investment' | 'other';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountNumber?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  openingBalance?: number;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  creditLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  billingCycleDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dueDateDay?: number;
}

/**
 * Every field is optional: the account form sends the full object, but the
 * archive toggle sends `{ isArchived }` alone. Extending CreateAccountDto here
 * would keep `name`/`type` required and reject those partial updates with a 400.
 */
export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(['cash', 'bank', 'ewallet', 'credit_card', 'investment', 'other'])
  type?: 'cash' | 'bank' | 'ewallet' | 'credit_card' | 'investment' | 'other';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  openingBalance?: number;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  creditLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  billingCycleDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dueDateDay?: number;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
