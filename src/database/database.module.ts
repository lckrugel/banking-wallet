import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzleFactory } from './drizzle.provider.js';
import { DrizzleUnitOfWork, UNIT_OF_WORK } from './unit-of-work.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: drizzleFactory,
    }),
  ],
  providers: [
    DrizzleUnitOfWork,
    { provide: UNIT_OF_WORK, useExisting: DrizzleUnitOfWork },
  ],
  exports: [UNIT_OF_WORK],
})
export class DatabaseModule {}
