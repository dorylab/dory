CREATE TABLE "connection_tls" (
    "connection_id" text PRIMARY KEY NOT NULL,
    "mode" text DEFAULT 'disable' NOT NULL,
    "ca_certificate_path" text,
    "client_certificate_path" text,
    "client_private_key_path" text,
    "server_name" text,
    "ciphers" text,
    "min_version" text,
    "max_version" text,
    "ca_certificate_encrypted" text,
    "client_certificate_encrypted" text,
    "client_private_key_encrypted" text,
    "client_private_key_passphrase_encrypted" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    CONSTRAINT "chk_connection_tls_mode" CHECK ("connection_tls"."mode" IN ('disable', 'prefer', 'require', 'verify-ca', 'verify-identity'))
);
