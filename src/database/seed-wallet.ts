import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { WalletService } from '../wallet/wallet.service.js';

async function main() {
  const userId = process.env.WALLET_SEED_USER_ID;
  const amount = process.env.WALLET_SEED_AMOUNT_CENTS;
  const seedReference = process.env.WALLET_SEED_REFERENCE;

  if (!userId || !amount || !/^\d+$/.test(amount) || BigInt(amount) <= 0n) {
    throw new Error(
      'Set WALLET_SEED_USER_ID and a positive WALLET_SEED_AMOUNT_CENTS',
    );
  }
  if (!seedReference?.trim()) {
    throw new Error('Set WALLET_SEED_REFERENCE to identify this seed operation');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const wallet = await app
      .get(WalletService)
      .seedUserWallet(userId, BigInt(amount), seedReference);
    console.info(
      `Wallet ${wallet.id}: balance=${wallet.balanceCents} cents, version=${wallet.version}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
