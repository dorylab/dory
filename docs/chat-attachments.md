# Chat attachments

Chat files are private to their uploader and conversation. They do not create organization data sources. The original file stays in the configured artifact object store (filesystem or S3); local DuckDB datasets are disposable, immutable caches keyed by owner, conversation, file digest and reader version.

Supported formats:

- CSV, TSV, JSON, JSONL, NDJSON, Parquet and XLSX: full-data DuckDB queries, with one table per Excel worksheet.
- TXT, Markdown and SQL: UTF-8 character pagination and literal search.
- PNG, JPEG and WebP: the existing model vision flow.

Limits are 20 files per message, 100 MiB per file and 500 MiB per message. Uploads stream directly from the original browser File into private storage. Aborting or exceeding the limit removes partial objects. Upload failures preserve the draft for retry.

## Agent tools

`readAttachment` (`dory_read_attachment`) returns structured-file table names, columns, full row counts and bounded previews. `mode: "text"` preserves character reads for textual files. `searchAttachment` searches original textual content across chunk boundaries.

`queryAttachment` (`dory_query_attachment`) accepts `attachmentIds` and a single read-only `sql` statement against the returned table names. It supports joins across attachments in the same conversation. Aggregation runs on the complete files; query output is capped at 1,000 rows, with an additional model-preview character budget. Results expose truncation flags and saved Artifact IDs for charts and reports.

Queries run in isolated in-memory DuckDB instances with 512 MB memory, two threads and a 60-second timeout. Cancellation interrupts the native query. External access is restricted to the authorized cache files, extensions cannot auto-install, and configuration is locked before model SQL is prepared. File/cell contents remain untrusted data.

ResultSet provenance records conversation, owner, file IDs, SHA-256 digests, table names and worksheet names. `0039_chat_attachment_sources` adds this nullable metadata in both PostgreSQL and PGlite. Existing database-query evidence is unchanged; attachment evidence does not manufacture a connection ID. Reports retain their evidence snapshots under the existing report permissions.

## Offline Excel deployment

`node scripts/prepare-duckdb-extensions.mjs` provisions the signed Excel extension for the installed DuckDB binary's exact version and platform. Both `yarn dev` and the Web build bootstrap invoke it. The build checks the signature by loading the downloaded extension and records its SHA-256 digest. Subsequent builds reuse a matching verified bundle.

The files in `apps/web/public/resources/duckdb/` are generated and ignored by Git. A clean build requires access to the official DuckDB extension repository, or a pre-provisioned matching extension and manifest. Build on the target native platform. The runtime only loads the packaged extension; it never downloads or installs one. Next standalone tracing includes the extension and native DuckDB companion libraries; Electron copies these through its existing standalone resources packaging.

After updating a local installation, restart through its normal startup path so the database migration runs. Starting an already-built deployment requires rebuilding its artifacts first.

## Targeted verification

```sh
yarn workspace web exec tsx --test scripts/tests/chat-attachment-data.test.ts ../../packages/drivers/scripts/tests/chat-attachments.test.ts ../../packages/artifacts/scripts/tests/chat-attachments.test.ts
yarn workspace web run typecheck
```

The tests cover full-file statistics, nested JSON, Parquet types, multi-sheet XLSX without automatic extension installation, cancellation, access isolation, report evidence, upload boundaries and real AWS SDK requests against a local S3-compatible HTTP fixture. Production S3 infrastructure and signed Electron installers require their normal release acceptance checks.
