import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
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

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @ApiProperty({ example: 'Alice Smith', minLength: 1 })
  @MinLength(1)
  name: string;
}
