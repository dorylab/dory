ALTER TABLE "semantic_models" RENAME TO "knowledge_models";
--> statement-breakpoint
ALTER TABLE "semantic_model_sources" RENAME TO "knowledge_model_sources";
--> statement-breakpoint
ALTER TABLE "semantic_model_knowledge_sources" RENAME TO "knowledge_sources";
--> statement-breakpoint
ALTER TABLE "semantic_verified_queries" RENAME TO "knowledge_verified_queries";
--> statement-breakpoint
ALTER TABLE "knowledge_model_sources" RENAME COLUMN "semantic_model_id" TO "knowledge_model_id";
--> statement-breakpoint
ALTER TABLE "knowledge_sources" RENAME COLUMN "semantic_model_id" TO "knowledge_model_id";
--> statement-breakpoint
ALTER TABLE "knowledge_verified_queries" RENAME COLUMN "semantic_model_id" TO "knowledge_model_id";
--> statement-breakpoint
ALTER TABLE "knowledge_model_sources" RENAME CONSTRAINT "pk_semantic_model_sources" TO "pk_knowledge_model_sources";
--> statement-breakpoint
ALTER TABLE "knowledge_model_sources" RENAME CONSTRAINT "semantic_model_sources_semantic_model_id_fkey" TO "knowledge_model_sources_knowledge_model_id_fkey";
--> statement-breakpoint
ALTER TABLE "knowledge_model_sources" RENAME CONSTRAINT "semantic_model_sources_connection_id_fkey" TO "knowledge_model_sources_connection_id_fkey";
--> statement-breakpoint
ALTER TABLE "knowledge_sources" RENAME CONSTRAINT "semantic_model_knowledge_sources_pkey" TO "knowledge_sources_pkey";
--> statement-breakpoint
ALTER TABLE "knowledge_sources" RENAME CONSTRAINT "semantic_model_knowledge_sources_semantic_model_id_fkey" TO "knowledge_sources_knowledge_model_id_fkey";
--> statement-breakpoint
ALTER TABLE "knowledge_sources" RENAME CONSTRAINT "semantic_model_knowledge_sources_connection_id_fkey" TO "knowledge_sources_connection_id_fkey";
--> statement-breakpoint
ALTER TABLE "knowledge_verified_queries" RENAME CONSTRAINT "semantic_verified_queries_pkey" TO "knowledge_verified_queries_pkey";
--> statement-breakpoint
ALTER TABLE "knowledge_verified_queries" RENAME CONSTRAINT "semantic_verified_queries_semantic_model_id_fkey" TO "knowledge_verified_queries_knowledge_model_id_fkey";
--> statement-breakpoint
ALTER TABLE "knowledge_verified_queries" RENAME CONSTRAINT "semantic_verified_queries_source_connection_id_fkey" TO "knowledge_verified_queries_source_connection_id_fkey";
--> statement-breakpoint
ALTER INDEX "uidx_semantic_models_org_name" RENAME TO "uidx_knowledge_models_org_name";
--> statement-breakpoint
ALTER INDEX "idx_semantic_models_org_updated" RENAME TO "idx_knowledge_models_org_updated";
--> statement-breakpoint
ALTER INDEX "idx_semantic_model_sources_connection" RENAME TO "idx_knowledge_model_sources_connection";
--> statement-breakpoint
ALTER INDEX "uidx_semantic_knowledge_sources_model_file" RENAME TO "uidx_knowledge_sources_model_file";
--> statement-breakpoint
ALTER INDEX "idx_semantic_knowledge_sources_org_model" RENAME TO "idx_knowledge_sources_org_model";
--> statement-breakpoint
ALTER INDEX "idx_semantic_knowledge_sources_connection" RENAME TO "idx_knowledge_sources_connection";
--> statement-breakpoint
ALTER INDEX "idx_semantic_verified_queries_model_updated" RENAME TO "idx_knowledge_verified_queries_model_updated";
--> statement-breakpoint
ALTER INDEX "idx_semantic_verified_queries_connection" RENAME TO "idx_knowledge_verified_queries_connection";
