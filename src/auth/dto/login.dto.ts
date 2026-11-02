import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s/g, '').toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
