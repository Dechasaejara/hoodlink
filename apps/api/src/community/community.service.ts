import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { actionSchema } from './action.schema';
import { CommunityRepository } from './community.repository';
import { TelegramService } from '../telegram/telegram.service';
import { APP_CONFIG, type AppConfig } from '../config';

@Injectable()
export class CommunityService {
  constructor(@Inject(CommunityRepository) private readonly repository: CommunityRepository, @Optional() @Inject(TelegramService) private readonly telegram?: TelegramService, @Optional() @Inject(APP_CONFIG) private readonly config?: AppConfig) {}
  async bootstrap(id: string) { return { ...await this.repository.bootstrap(id), demoRoleSwitch: this.config?.ALLOW_DEMO_ROLE_SWITCH || false }; }
  messages(id: string, channel: string) { return this.repository.messages(id, channel); }

  async action(id: string, input: unknown) {
    const parsed = actionSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message || 'Invalid action.');
    const action = parsed.data;
    const ensure = (exists: boolean) => { if (!exists) throw new BadRequestException('This item is no longer available.'); };
    await this.repository.withUser(id, async transaction => {
      switch (action.type) {
        case 'hood': case 'challenge': case 'save': case 'rsvp': case 'like': case 'claim':
          ensure(await this.repository.exists(transaction, action.type, action.id));
          await this.repository.toggle(transaction, action.type, id, action.id);
          break;
        case 'post': {
          const hood = await this.repository.hoodByName(transaction, action.hood);
          ensure(!!hood && await this.repository.canParticipate(transaction, id, hood.id));
          await this.repository.createPost(transaction, id, hood!.id, action.body);
          break;
        }
        case 'message':
          ensure(await this.repository.channelExists(transaction, action.channel) && await this.repository.canParticipate(transaction, id, action.channel));
          await this.repository.createMessage(transaction, id, action.channel, action.body);
          break;
        case 'profile': {
          const hood = await this.repository.hoodByName(transaction, action.hood);
          ensure(!!hood);
          ensure(await this.repository.schoolExists(transaction, action.school));
          await this.repository.updateProfile(transaction, id, { name: action.name, bio: action.bio, school: action.school, hoodId: hood!.id });
          break;
        }
        case 'settings': await this.repository.updateSettings(transaction, id, { notifications: action.notifications, publicProfile: action.publicProfile }); break;
        case 'theme': await this.repository.updateTheme(transaction, id, action.theme); break;
      }
      if (this.telegram && ['post', 'rsvp', 'claim', 'challenge'].includes(action.type)) {
        const title = { post: 'Your moment is shared', rsvp: 'Event RSVP updated', claim: 'Your local offer is ready', challenge: 'Challenge participation updated' }[action.type as 'post' | 'rsvp' | 'claim' | 'challenge'];
        const path = action.type === 'rsvp' ? `/events/${action.id}` : action.type === 'claim' ? `/businesses/${action.id}` : action.type === 'challenge' ? `/challenges/${action.id}` : '/';
        await this.telegram.queue(transaction, id, title, 'Your community activity has been saved. Open HoodLink for the latest details.', path);
      }
    });
    return this.bootstrap(id);
  }
}