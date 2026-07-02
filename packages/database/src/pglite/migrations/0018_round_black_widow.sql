ALTER TABLE "connection_identity_secrets" ADD COLUMN IF NOT EXISTS "private_key_encrypted" text;
--> statement-breakpoint
ALTER TABLE "connection_identity_secrets" ADD COLUMN IF NOT EXISTS "private_key_passphrase_encrypted" text;
