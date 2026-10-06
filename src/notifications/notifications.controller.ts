import { Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.notifications.findAll(user.userId);
  }

  @Patch(':id/read')
  markAsRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markAsRead(user.userId, id);
  }

  @Post('read-all')
  @HttpCode(200)
  markAllAsRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllAsRead(user.userId);
  }
}
