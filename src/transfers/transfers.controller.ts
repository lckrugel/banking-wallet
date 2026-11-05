import { BadRequestException, Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiHeader, ApiNotFoundResponse, ApiOperation, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/auth-user.decorator.js';
import { CreateTransferDto } from './transfer.dto.js';
import { TransferResponseDto } from './transfer-response.dto.js';
import { TransfersService } from './transfers.service.js';

@UseGuards(AuthGuard)
@Controller('transfers')
@ApiTags('Transferências')
@ApiBearerAuth()
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  @ApiOperation({ summary: 'Transferir fundos para outro usuário' })
  @ApiHeader({ name: 'idempotency-key', required: true, description: 'UUID para permitir novas tentativas seguras da solicitação' })
  @ApiCreatedResponse({ type: TransferResponseDto })
  @ApiBadRequestResponse({ description: 'Chave de idempotência ausente ou inválida, ou solicitação inválida' })
  @ApiConflictResponse({ description: 'Chave de idempotência reutilizada com uma solicitação diferente' })
  @ApiNotFoundResponse({ description: 'Destinatário ou carteira não encontrado' })
  @ApiUnprocessableEntityResponse({ description: 'Transferência inválida, saldo insuficiente ou transferência para si mesmo' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTransferDto, @Headers('idempotency-key') key?: string) {
    validateKey(key);
    return this.transfers.create(user.id, dto.recipientUserId, dto.amountCents, key.toLowerCase());
  }

  @Post(':id/reverse')
  @ApiOperation({ summary: 'Estornar uma transferência concluída' })
  @ApiHeader({ name: 'idempotency-key', required: true, description: 'UUID para permitir novas tentativas seguras da solicitação' })
  @ApiCreatedResponse({ description: 'Estorno criado', type: TransferResponseDto })
  @ApiBadRequestResponse({ description: 'Identificador da transferência ou chave de idempotência inválido' })
  @ApiConflictResponse({ description: 'Transferência não pode ser estornada ou chave já utilizada' })
  @ApiNotFoundResponse({ description: 'Transferência não encontrada' })
  reverse(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Headers('idempotency-key') key?: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new BadRequestException('A valid transfer UUID is required');
    validateKey(key);
    return this.transfers.reverse(user.id, id.toLowerCase(), key.toLowerCase());
  }
}

function validateKey(key?: string): asserts key is string {
  if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw new BadRequestException('A valid Idempotency-Key UUID is required');
}
