import { IsString, IsUUID, Matches } from 'class-validator';

export class CreateTransferDto {
  @IsUUID()
  recipientUserId!: string;

  @IsString()
  @Matches(/^[0-9]+$/)
  amountCents!: string;
}
