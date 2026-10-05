import { Controller, Get, Inject, Module, ServiceUnavailableException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SkipThrottle, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { SessionThrottlerGuard } from './auth/session-throttler.guard';
import { CommunityDataModule } from './community/community.module';
import { CommunityController } from './community/community.controller';
import { CommunityService } from './community/community.service';
import { DatabaseModule } from './database/database.module';
import { DatabaseService } from './database/database.service';
import { TelegramModule } from './telegram/telegram.module';
import { AdminModule } from './admin/admin.module';

@Controller('v1')
@SkipThrottle()
class HealthController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}
  @Get('health/live') live() { return { status: 'ok', service: 'hoodlink-api' }; }
  @Get('health') async ready() { try { await this.database.healthy(); return { status: 'ok', database: 'connected' }; } catch { throw new ServiceUnavailableException('Database is unavailable.'); } }
}

@Module({ imports: [DatabaseModule, CommunityDataModule, AuthModule, TelegramModule, AdminModule, ThrottlerModule.forRoot([{ ttl: 60000, limit: 180 }])], controllers: [HealthController, CommunityController], providers: [CommunityService, { provide: APP_GUARD, useClass: SessionThrottlerGuard }] })
export class AppModule {}