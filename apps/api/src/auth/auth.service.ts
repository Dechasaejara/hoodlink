import { BadRequestException, Inject, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../config';
import { validateTelegramData } from '../auth';
import { CommunityRepository } from '../community/community.repository';
import { photo } from '../seed';
import type { Profile, Role } from '../types';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class AuthService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig, @Inject(CommunityRepository) private readonly repository: CommunityRepository, @Optional() @Inject(TelegramService) private readonly telegram?: TelegramService) {}

  async authenticate(input: unknown) {
    const parsed = z.object({ initData: z.string().max(16384).optional(), demo: z.boolean().optional(), role: z.enum(['member', 'moderator', 'admin', 'super_admin']).optional() }).safeParse(input);
    if (!parsed.success) throw new BadRequestException('Invalid authentication request.');
    let profile: Profile;
    let provisionRole: Role = 'member';
    if (parsed.data.initData) {
      const user = validateTelegramData(parsed.data.initData, this.config.BOT_TOKEN);
      if (this.config.SUPER_ADMIN_TELEGRAM_IDS.split(',').includes(String(user.id))) provisionRole = 'super_admin';
      profile = { id: `tg-${user.id}`, name: [user.first_name, user.last_name].filter(Boolean).join(' '), avatar: user.photo_url || '', school: 'Addis Ababa University', hood: 'Bole Hood', bio: 'Making a little difference, close to home.' };
    } else if (parsed.data.demo && this.config.ALLOW_DEMO_AUTH) {
      if (parsed.data.role && !this.config.ALLOW_DEMO_ROLE_SWITCH) throw new UnauthorizedException('Demo role preview is disabled.');
      provisionRole = parsed.data.role || 'member';
      profile = { id: 'demo-yonas', name: 'Yonas Tesfaye', avatar: photo('photo-1506794778202-cad84cf45f1d', 160), school: 'Addis Ababa University', hood: 'Bole Hood', bio: 'Student. Coffee enthusiast. Building a better hood, together.' };
      if (provisionRole !== 'member') profile = { ...profile, id: `demo-${provisionRole}`, name: provisionRole === 'super_admin' ? 'HoodLink Operator' : provisionRole === 'admin' ? 'Catalog Administrator' : 'Community Moderator', bio: 'Local development role preview.' };
    } else throw new UnauthorizedException('Open HoodLink from Telegram to sign in.');
    await this.repository.ensureUser(profile, provisionRole);
    if (provisionRole === 'super_admin' || (parsed.data.demo && this.config.ALLOW_DEMO_ROLE_SWITCH)) await this.repository.provisionRole(profile.id, provisionRole);
    if (parsed.data.initData && this.telegram) {
      const user = validateTelegramData(parsed.data.initData, this.config.BOT_TOKEN);
      await this.telegram.connectAccount(profile.id, user.id, user.allows_write_to_pm || false);
    }
    return { token: jwt.sign({}, this.config.SESSION_SECRET, { subject: profile.id, expiresIn: '12h', issuer: 'hoodlink', audience: 'hoodlink-miniapp', algorithm: 'HS256' }) };
  }

  subject(authorization?: string) {
    try {
      if (!authorization?.startsWith('Bearer ')) throw new Error();
      const payload = jwt.verify(authorization.slice(7), this.config.SESSION_SECRET, { algorithms: ['HS256'], issuer: 'hoodlink', audience: 'hoodlink-miniapp' });
      if (typeof payload === 'string' || !payload.sub) throw new Error();
      return payload.sub;
    } catch { throw new UnauthorizedException('Please sign in again.'); }
  }

  async identify(authorization?: string) {
    const id = this.subject(authorization);
    if (id.startsWith('demo-') && !this.config.ALLOW_DEMO_AUTH) throw new UnauthorizedException('Demo sessions are disabled.');
    if (!await this.repository.hasUser(id)) throw new UnauthorizedException('Please sign in again.');
    return id;
  }
}