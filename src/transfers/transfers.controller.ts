import { BadRequestException, Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/auth-user.decorator.js';
import { CreateTransferDto } from './transfer.dto.js';
import { TransfersService } from './transfers.service.js';

@UseGuards(AuthGuard)
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTransferDto, @Headers('idempotency-key') key?: string) {
    validateKey(key);
    return this.transfers.create(user.id, dto.recipientUserId, dto.amountCents, key.toLowerCase());
  }

  @Post(':id/reverse')
  reverse(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Headers('idempotency-key') key?: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new BadRequestException('A valid transfer UUID is required');
    validateKey(key);
    return this.transfers.reverse(user.id, id.toLowerCase(), key.toLowerCase());
  }
}

function validateKey(key?: string): asserts key is string {
  if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw new BadRequestException('A valid Idempotency-Key UUID is required');
}
