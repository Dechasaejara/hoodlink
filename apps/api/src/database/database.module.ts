import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, readConfig } from '../config';
import { DatabaseService } from './database.service';

@Global()
@Module({ providers: [{ provide: APP_CONFIG, useFactory: () => readConfig() }, DatabaseService], exports: [APP_CONFIG, DatabaseService] })
export class DatabaseModule {}