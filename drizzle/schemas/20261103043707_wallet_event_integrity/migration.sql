ALTER TABLE "events" ADD CONSTRAINT "events_aggregate_id_wallets_id_fkey" FOREIGN KEY ("aggregate_id") REFERENCES "wallets"("id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_operation_id_transfers_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "transfers"("id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "ck_event_version_positive" CHECK ("version" >= 1);--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "ck_wallet_version_positive" CHECK ("version" >= 1);