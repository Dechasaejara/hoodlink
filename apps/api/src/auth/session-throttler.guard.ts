import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';

@Injectable()
export class SessionThrottlerGuard extends ThrottlerGuard {
  @Inject(AuthService) private readonly auth!: AuthService;

  protected async getTracker(request: Record<string, unknown>) {
    const headers = request.headers as { authorization?: string } | undefined;
    try { return `account:${this.auth.subject(headers?.authorization)}`; }
    catch { return super.getTracker(request); }
  }
}