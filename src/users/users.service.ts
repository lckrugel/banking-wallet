import { Injectable } from '@nestjs/common';
import type { DatabaseTransaction } from '../database/database.types.js';
import type { UserResponseDto } from './dto/user-response.dto.js';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  create(
    tx: DatabaseTransaction,
    input: { email: string; password: string; name: string },
  ): Promise<UserResponseDto> {
    return this.users.create(tx, input);
  }

  findByEmail(tx: DatabaseTransaction, email: string) {
    return this.users.findByEmail(tx, email);
  }
}
