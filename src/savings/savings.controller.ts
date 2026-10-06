import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SavingsService } from './savings.service';
import { CreateSavingGoalDto, UpdateSavingGoalDto, AddSavingContributionDto } from './dto/saving.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('savings')
export class SavingsController {
  constructor(private savings: SavingsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('includeArchived') includeArchived?: string) {
    return this.savings.findAll(user.userId, includeArchived === 'true');
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.savings.findOne(user.userId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSavingGoalDto) {
    return this.savings.create(user.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSavingGoalDto) {
    return this.savings.update(user.userId, id, dto);
  }

  @Post(':id/contributions')
  addContribution(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddSavingContributionDto,
  ) {
    return this.savings.addContribution(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.savings.remove(user.userId, id);
  }
}
