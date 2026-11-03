import { Module } from '@nestjs/common';
import { EventsRepository } from './events.repository.js';
import { EventsService } from './events.service.js';

@Module({
  providers: [EventsRepository, EventsService],
  exports: [EventsRepository, EventsService],
})
export class EventsModule {}
