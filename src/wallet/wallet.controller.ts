import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WalletService } from './wallet.service.js';
import { CurrentUser } from '../auth/auth-user.decorator.js';
import { toWalletResponseDto, WalletResponseDto } from './dto/wallet.dto.js';
import { type AuthenticatedUser, AuthGuard } from '../auth/auth.guard.js';
import { WalletHistoryService } from './wallet-history.js';

@UseGuards(AuthGuard)
@Controller('wallets')
@ApiTags('Carteiras')
@ApiBearerAuth()
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly historyService: WalletHistoryService,
  ) {}

  @Get('history')
  @ApiOperation({ summary: 'Consultar o histórico paginado da carteira' })
  @ApiQuery({ name: 'limit', required: false, description: 'Quantidade de itens por página (1–100; padrão: 20)' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor opaco retornado pela página anterior' })
  @ApiOkResponse({ schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { operationId: { type: 'string', format: 'uuid' }, type: { type: 'string', enum: ['TRANSFER', 'REVERSAL'] }, direction: { type: 'string', enum: ['OUTGOING', 'INCOMING'] }, amountCents: { type: 'string', example: '1250' }, status: { type: 'string' }, senderWalletId: { type: 'string', format: 'uuid' }, receiverWalletId: { type: 'string', format: 'uuid' }, reversalOf: { type: 'string', nullable: true }, createdAt: { type: 'string', format: 'date-time' } } } }, nextCursor: { type: 'string', nullable: true } } } })
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.historyService.history(user.id, limit, cursor);
  }

  @Get()
  @ApiOperation({ summary: 'Consultar o saldo da carteira do usuário autenticado' })
  @ApiOkResponse({ type: WalletResponseDto })
  async checkWallet(@CurrentUser() user: AuthenticatedUser) {
    const wallet = await this.walletService.findUserWallet(user.id);
    return toWalletResponseDto(wallet);
  }
}
