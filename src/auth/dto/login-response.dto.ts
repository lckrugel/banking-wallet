import { ApiProperty } from '@nestjs/swagger';

export class LoginResponseDto {
  @ApiProperty({ description: 'Token de acesso JWT' })
  accessToken!: string;
  @ApiProperty({ example: 'Bearer', enum: ['Bearer'] })
  tokenType!: 'Bearer';
  @ApiProperty({ description: 'Duração do token em segundos', example: 3600 })
  expiresIn!: number;
}
