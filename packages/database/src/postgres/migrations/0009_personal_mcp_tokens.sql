CREATE INDEX "idx_mcp_access_tokens_organization_user_created" ON "mcp_access_tokens" USING btree ("organization_id","created_by_user_id","created_at");
