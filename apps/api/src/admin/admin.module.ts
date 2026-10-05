import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { RolesGuard } from './roles.guard';

@Module({ imports: [AuthModule], controllers: [AdminController], providers: [AdminService, RolesGuard] })
export class AdminModule {}