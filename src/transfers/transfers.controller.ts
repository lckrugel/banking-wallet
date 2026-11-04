import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/auth-user.decorator.js';
import { CreateTransferDto } from './transfer.dto.js';
import { TransfersService } from './transfers.service.js';

@UseGuards(AuthGuard)
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTransferDto) {
    return this.transfers.create(user.id, dto.recipientUserId, dto.amountCents);
  }
}
