import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { Database } from '../database/database.types.js';
import { PasswordHasher } from '../auth/password-hasher.service.js';
import { UsersService } from '../users/users.service.js';
import type { UserResponseDto } from '../users/dto/user-response.dto.js';

@Injectable()
export class RegistrationService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly users: UsersService,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async register(input: {
    email: string;
    password: string;
    name: string;
  }): Promise<UserResponseDto> {
    const password = await this.passwordHasher.hash(input.password);
    return this.db.transaction((tx) =>
      this.users.create(tx, { ...input, password }),
    );
  }
}
