import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from '../auth/dto/login.dto.js';

describe('Registration DTO', () => {
  it('normalizes registration email and trims the required name', async () => {
    const dto = plainToInstance(RegisterDto, {
      email: '  PERSON @Example.COM  ',
      password: 'secret1',
      name: '  Person  ',
    });

    expect(dto.email).toBe('person@example.com');
    expect(dto.name).toBe('Person');
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects missing name, invalid email, and password shorter than six characters', async () => {
    const dto = plainToInstance(RegisterDto, {
      email: 'not-an-email',
      password: '12345',
      name: '   ',
    });

    const errors = await validate(dto);
    const properties = errors.map((error) => error.property);
    expect(properties).toContain('email');
    expect(properties).toContain('password');
    expect(properties).toContain('name');
  });

  it('normalizes login email and rejects short passwords', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'USER @Example.com',
      password: '12345',
    });

    expect(dto.email).toBe('user@example.com');
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(['password']);
  });
});
