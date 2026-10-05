import { Global, Module } from '@nestjs/common';
import { CommunityRepository } from './community.repository';

@Global()
@Module({ providers: [CommunityRepository], exports: [CommunityRepository] })
export class CommunityDataModule {}