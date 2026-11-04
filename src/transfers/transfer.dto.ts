import { IsString, IsUUID, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTransferDto {
  @ApiProperty({ format: 'uuid', example: 'a3b6f5c4-1234-4abc-8def-1234567890ab' })
  @IsUUID()
  recipientUserId!: string;

  @IsString()
  @ApiProperty({ description: 'Valor positivo em centavos inteiros, representado como texto decimal', example: '1250', pattern: '^[0-9]+$' })
  @Matches(/^[0-9]+$/)
  amountCents!: string;
}
