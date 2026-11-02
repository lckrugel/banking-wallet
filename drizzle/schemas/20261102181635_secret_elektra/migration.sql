CREATE TYPE "aggregate_type" AS ENUM('WALLET');--> statement-breakpoint
CREATE TYPE "event_type" AS ENUM('WALLET_CREATED', 'SEED_FUNDS', 'FUNDS_CREDITED', 'FUNDS_DEBITED');--> statement-breakpoint
CREATE TYPE "status" AS ENUM('COMPLETED', 'REVERSED');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"aggregateType" "aggregate_type" NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"eventType" "event_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"operation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_events_aggregate_version" UNIQUE("aggregateType","aggregate_id","version")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"key" uuid NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_user_idempotency" UNIQUE("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sender_wallet" uuid NOT NULL,
	"receiver_wallet" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status" "status" DEFAULT 'COMPLETED'::"status" NOT NULL,
	"reversal_of" uuid UNIQUE,
	"idempotency_key_id" uuid NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_transfer_amount_positive" CHECK ("amount_cents" > 0),
	CONSTRAINT "ck_not_self_transfer" CHECK ("receiver_wallet" <> "sender_wallet"),
	CONSTRAINT "ck_transfer_not_self_reversal" CHECK ("reversal_of" IS NULL OR "reversal_of" <> "id")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL UNIQUE,
	"balance_cents" bigint DEFAULT 0 NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_positive_balance" CHECK ("balance_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "sessions" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "revoked_at" SET DATA TYPE timestamp with time zone USING "revoked_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp with time zone USING "deleted_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_aggregate" ON "events" ("aggregateType","aggregate_id");--> statement-breakpoint
CREATE INDEX "idx_sender_wallet" ON "transfers" ("sender_wallet");--> statement-breakpoint
CREATE INDEX "idx_receiver_wallet" ON "transfers" ("receiver_wallet");--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_sender_wallet_wallets_id_fkey" FOREIGN KEY ("sender_wallet") REFERENCES "wallets"("id");--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_receiver_wallet_wallets_id_fkey" FOREIGN KEY ("receiver_wallet") REFERENCES "wallets"("id");--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_reversal_of_transfers_id_fkey" FOREIGN KEY ("reversal_of") REFERENCES "transfers"("id");--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_idempotency_key_id_idempotency_keys_id_fkey" FOREIGN KEY ("idempotency_key_id") REFERENCES "idempotency_keys"("id");--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");