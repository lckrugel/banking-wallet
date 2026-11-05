import { Wallet } from '../wallet.entity.js';
import { ApiProperty } from '@nestjs/swagger';

export class WalletResponseDto {
  @ApiProperty({ format: 'uuid' })
  walletId: string;
  @ApiProperty({ description: 'Saldo da carteira em centavos inteiros, representado como texto decimal', example: '25000', pattern: '^-?[0-9]+$' })
  balance: string;
}

export function toWalletResponseDto(wallet: Wallet): WalletResponseDto {
  return {
    walletId: wallet.id,
    balance: `${wallet.balanceCents}`,
  };
}
