import {
  IsString,
  IsInt,
  IsOptional,
  IsBoolean,
  IsDateString,
  Min,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateSavingGoalDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsInt()
  @Min(1)
  targetAmount: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  currentAmount?: number;

  @IsDateString()
  targetDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}

export class UpdateSavingGoalDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  targetAmount?: number;

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

export class AddSavingContributionDto {
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
