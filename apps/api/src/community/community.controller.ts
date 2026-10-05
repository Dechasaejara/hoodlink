import { BadRequestException, Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { CommunityService } from './community.service';

@Controller('v1')
@UseGuards(AuthGuard)
export class CommunityController {
  constructor(@Inject(CommunityService) private readonly community: CommunityService) {}
  @Get('bootstrap') bootstrap(@CurrentUser() id: string) { return this.community.bootstrap(id); }
  @Post('actions') action(@CurrentUser() id: string, @Body() body: unknown) { return this.community.action(id, body); }
  @Get('messages/:channel') messages(@CurrentUser() id: string, @Param('channel') channel: string) { if (channel.length > 100) throw new BadRequestException(); return this.community.messages(id, channel); }
}