DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'account_user_id_user_id_fk'
          AND conrelid = 'account'::regclass
    ) THEN
        ALTER TABLE "account"
            ADD CONSTRAINT "account_user_id_user_id_fk"
            FOREIGN KEY ("user_id")
            REFERENCES "public"."user"("id")
            ON DELETE cascade
            ON UPDATE no action;
    END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'session_user_id_user_id_fk'
          AND conrelid = 'session'::regclass
    ) THEN
        ALTER TABLE "session"
            ADD CONSTRAINT "session_user_id_user_id_fk"
            FOREIGN KEY ("user_id")
            REFERENCES "public"."user"("id")
            ON DELETE cascade
            ON UPDATE no action;
    END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'members_user_id_user_id_fk'
          AND conrelid = 'members'::regclass
    ) THEN
        ALTER TABLE "members"
            ADD CONSTRAINT "members_user_id_user_id_fk"
            FOREIGN KEY ("user_id")
            REFERENCES "public"."user"("id")
            ON DELETE cascade
            ON UPDATE no action;
    END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'members_organization_id_organizations_id_fk'
          AND conrelid = 'members'::regclass
    ) THEN
        ALTER TABLE "members"
            ADD CONSTRAINT "members_organization_id_organizations_id_fk"
            FOREIGN KEY ("organization_id")
            REFERENCES "public"."organizations"("id")
            ON DELETE cascade
            ON UPDATE no action;
    END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'organizations_owner_user_id_user_id_fk'
          AND conrelid = 'organizations'::regclass
    ) THEN
        ALTER TABLE "organizations"
            ADD CONSTRAINT "organizations_owner_user_id_user_id_fk"
            FOREIGN KEY ("owner_user_id")
            REFERENCES "public"."user"("id")
            ON DELETE restrict
            ON UPDATE no action;
    END IF;
END
$$;
