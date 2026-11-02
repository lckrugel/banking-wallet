import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s/g, '').toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  name: string;
}
