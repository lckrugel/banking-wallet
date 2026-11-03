import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzleFactory } from './drizzle.provider.js';
import { DrizzleUnitOfWork } from './unity-of-work.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: drizzleFactory,
    }),
  ],
  providers: [DrizzleUnitOfWork],
  exports: [DrizzleUnitOfWork],
})
export class DatabaseModule {}
