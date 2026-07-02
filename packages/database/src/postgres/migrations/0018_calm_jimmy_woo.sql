ALTER TABLE "connection_identity_secrets" ADD COLUMN "private_key_encrypted" text;
ALTER TABLE "connection_identity_secrets" ADD COLUMN "private_key_passphrase_encrypted" text;
