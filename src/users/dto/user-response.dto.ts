import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'email' })
  email!: string;
  @ApiProperty({ example: 'Alice Smith' })
  name!: string;
}
