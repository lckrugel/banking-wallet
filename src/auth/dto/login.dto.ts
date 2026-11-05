import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'alice@example.com', format: 'email' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s/g, '').toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  @IsString()
  @ApiProperty({ example: 'secure-password', minLength: 6, format: 'password' })
  @MinLength(6)
  password: string;
}
