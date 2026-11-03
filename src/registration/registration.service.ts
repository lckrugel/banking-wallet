import { Inject, Injectable } from '@nestjs/common';
import { PasswordHasher } from '../auth/password-hasher.service.js';
import type { UserResponseDto } from '../users/dto/user-response.dto.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../database/unit-of-work.js';
import { WalletService } from '../wallet/wallet.service.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class RegistrationService {
  constructor(
    private readonly users: UsersService,
    private readonly wallet: WalletService,
    private readonly passwordHasher: PasswordHasher,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async register(input: {
    email: string;
    password: string;
    name: string;
  }): Promise<UserResponseDto> {
    const password = await this.passwordHasher.hash(input.password);
    return this.uow.execute(async (tx) => {
      const user = await this.users.create(tx, { ...input, password });
      await this.wallet.createForUser(tx, user.id);
      return user;
    });
  }
}
