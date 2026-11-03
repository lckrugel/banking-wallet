import { randomUUID } from 'node:crypto';
import {
  InvalidEventHistory,
  InvalidEventVersioning,
  InvalidSeedReference,
  InvalidWalletVersion,
  InsufficientFunds,
  SeedAmountNotPositive,
  TransferAmountNotPositive,
  WalletBalanceNegative,
} from './wallet.errors.js';

export type WalletSnapshot = {
  id: string;
  userId: string;
  balanceCents: bigint;
  version: number;
};

export type WalletEvent =
  | { readonly type: 'WALLET_CREATED'; readonly version: number }
  | {
      readonly type: 'SEED_FUNDS';
      readonly version: number;
      readonly amountCents: bigint;
      readonly seedReference: string;
    }
  | {
      readonly type: 'FUNDS_CREDITED';
      readonly version: number;
      readonly amountCents: bigint;
    }
  | {
      readonly type: 'FUNDS_DEBITED';
      readonly version: number;
      readonly amountCents: bigint;
    };

export class Wallet {
  private _pendingEvents: WalletEvent[] = [];
  private constructor(
    private readonly _id: string,
    private readonly _userId: string,
    private _balanceCents: bigint,
    private _version: number,
  ) {}

  public static createWallet(userId: string): Wallet {
    const id = randomUUID();
    const wallet = new Wallet(id, userId, 0n, 1);
    wallet._pendingEvents.push({
      type: 'WALLET_CREATED',
      version: 1,
    });
    return wallet;
  }

  public static fromSnapshot(snapshot: WalletSnapshot): Wallet {
    if (!Number.isSafeInteger(snapshot.version) || snapshot.version < 1) {
      throw new InvalidWalletVersion();
    }
    if (snapshot.balanceCents < 0) {
      throw new WalletBalanceNegative();
    }
    const wallet = new Wallet(
      snapshot.id,
      snapshot.userId,
      snapshot.balanceCents,
      snapshot.version,
    );
    return wallet;
  }

  public static fromHistory(
    id: string,
    userId: string,
    history: readonly WalletEvent[],
  ): Wallet {
    const events = parseEventHistory(Array.from(history));
    const wallet = new Wallet(id, userId, 0n, 0);
    for (const event of events) {
      wallet.applyEvent(event);
    }
    return wallet;
  }

  private applyEvent(event: WalletEvent) {
    switch (event.type) {
      case 'WALLET_CREATED':
        break;

      case 'FUNDS_CREDITED':
        if (event.amountCents <= 0) {
          throw new TransferAmountNotPositive();
        }
        this._balanceCents += event.amountCents;
        break;

      case 'SEED_FUNDS':
        if (event.amountCents < 0) {
          throw new SeedAmountNotPositive();
        }
        this._balanceCents += event.amountCents;
        break;

      case 'FUNDS_DEBITED':
        if (event.amountCents <= 0) {
          throw new TransferAmountNotPositive();
        }
        if (this._balanceCents - event.amountCents < 0) {
          throw new WalletBalanceNegative();
        }
        this._balanceCents -= event.amountCents;
        break;
    }
    this._version = event.version;
  }

  public get id(): string {
    return this._id;
  }

  public get userId(): string {
    return this._userId;
  }

  public get balanceCents(): bigint {
    return this._balanceCents;
  }

  public get version(): number {
    return this._version;
  }

  public get pendingEvents(): readonly WalletEvent[] {
    return this._pendingEvents.map((event) => ({ ...event }));
  }

  public credit(amount: bigint) {
    if (amount <= 0) {
      throw new TransferAmountNotPositive();
    }
    this._balanceCents += amount;
    this._version++;
    this._pendingEvents.push({
      type: 'FUNDS_CREDITED',
      amountCents: amount,
      version: this._version,
    });
  }

  public debit(amount: bigint) {
    if (amount <= 0) {
      throw new TransferAmountNotPositive();
    }
    if (this._balanceCents - amount < 0) {
      throw new InsufficientFunds();
    }
    this._balanceCents -= amount;
    this._version++;
    this._pendingEvents.push({
      type: 'FUNDS_DEBITED',
      amountCents: amount,
      version: this._version,
    });
  }

  public seed(amount: bigint, seedReference: string) {
    if (amount < 0) {
      throw new SeedAmountNotPositive();
    }
    if (seedReference.trim().length === 0) {
      throw new InvalidSeedReference();
    }
    this._balanceCents += amount;
    this._version++;
    this._pendingEvents.push({
      type: 'SEED_FUNDS',
      amountCents: amount,
      version: this._version,
      seedReference,
    });
  }
}

function parseEventHistory(events: readonly WalletEvent[]): WalletEvent[] {
  // Rejects empty histories
  if (events.length < 1) {
    throw new InvalidEventHistory();
  }

  // Checks for duplicated events versioning
  const eventVersions = new Set<number>(events.map((e) => e.version));
  if (eventVersions.size !== events.length) {
    throw new InvalidEventHistory();
  }

  // Checks if there is only one 'WALLET_CREATED' event and if it is the first one on the versioning
  const walletCreatedEvents = events.filter((e) => e.type === 'WALLET_CREATED');
  if (walletCreatedEvents.length !== 1) {
    throw new InvalidEventHistory();
  } else if (walletCreatedEvents[0].version !== 1) {
    throw new InvalidEventVersioning();
  }

  // Checks if the events follow a linear versioning order, with no gaps
  const orderedEvents = [...events].sort((a, b) => a.version - b.version);
  let previousVersion: number | null = null;
  for (const event of orderedEvents) {
    if (previousVersion !== null && event.version !== previousVersion + 1) {
      throw new InvalidEventVersioning();
    }
    previousVersion = event.version;
  }

  return orderedEvents;
}
