import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransferResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  senderWallet!: string;

  @ApiProperty({ format: 'uuid' })
  receiverWallet!: string;

  @ApiProperty({ description: 'Valor em centavos, representado como texto decimal', example: '1250' })
  amountCents!: string;

  @ApiProperty({ enum: ['COMPLETED'] })
  status!: 'COMPLETED';

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Identificador da transferência original, presente em estornos' })
  reversalOf?: string;
}
