import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AdminService } from './admin.service';
import { RequireRole, RolesGuard } from './roles.guard';

@Controller('v1/admin')
@UseGuards(AuthGuard, RolesGuard)
@RequireRole('moderator')
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}
  @Get('overview') overview(@CurrentUser() id: string) { return this.admin.overview(id); }
  @Get('catalog/:entity') @RequireRole('admin') list(@CurrentUser() id: string, @Param('entity') entity: string) { return this.admin.list(id, entity); }
  @Post('catalog/:entity') @RequireRole('admin') save(@CurrentUser() id: string, @Param('entity') entity: string, @Body() body: unknown) { return this.admin.save(id, entity, body); }
  @Post('catalog/:entity/:recordId/archive') @RequireRole('admin') archive(@CurrentUser() id: string, @Param('entity') entity: string, @Param('recordId') recordId: string, @Body() body: unknown) { return this.admin.archive(id, entity, recordId, body); }
  @Get('users') @RequireRole('super_admin') users(@CurrentUser() id: string) { return this.admin.users(id); }
  @Post('users/:userId/role') @RequireRole('super_admin') role(@CurrentUser() id: string, @Param('userId') userId: string, @Body() body: unknown) { return this.admin.assignRole(id, userId, body); }
  @Get('posts') posts(@CurrentUser() id: string) { return this.admin.posts(id); }
  @Post('posts/:postId/moderation') moderate(@CurrentUser() id: string, @Param('postId') postId: string, @Body() body: unknown) { return this.admin.moderate(id, postId, body); }
  @Get('audit') @RequireRole('super_admin') audit(@CurrentUser() id: string) { return this.admin.auditLog(id); }
}