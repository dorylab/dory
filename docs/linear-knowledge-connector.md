# Linear knowledge connector

Dory Web, Docker self-hosting, and Desktop import project summaries, full descriptions,
and documents from explicitly selected Linear projects using an API Key. Sources are
read-only and available through existing knowledge search and Agent source tools,
with links to the originals. Issues, comments, project updates, attachments, and
external-link bodies are not imported. Archived projects and documents are included.
New projects are not selected automatically.

## Deployment

Web and Docker require the normal Dory database configuration and a persistent,
base64-encoded 32-byte `DS_SECRET_KEY`. Keep the same key across restarts and replicas.
Desktop generates its own key, saves it in `desktop-secrets.json` in the application
user data directory with restrictive permissions, and injects it into the local server.
Back up that file with the Desktop database. A failure to persist secrets blocks startup.

Enter the Linear API Key in the application. There are no Linear environment variables
and no Linear OAuth app, webhook, or public callback URL to configure. Dory's normal
`BETTER_AUTH_URL` setting still applies to Web login; it is not a Linear callback.

Run normal database bootstrap/migrations before serving the updated application.
Postgres and PGlite both apply `0033_linear_api_key` after the unchanged historical
`0032_linear_knowledge_connector`. The new migration cancels old Linear jobs, removes
OAuth credentials/state/delivery tables, and pauses existing Linear connectors. It
preserves connector IDs, selected projects, knowledge content, original links, and
last successful sync times. OAuth tokens are never converted into API Keys. An admin
must enter a Key for the same Linear workspace to rebind and resume those connectors.
GitHub connections keep their existing behavior. Deploy all replicas together.

## Connect and operate

Create a personal API Key in Linear's **Settings → Security & access**, with read access
to the intended projects. A Dory organization owner/admin opens **Knowledge → Sources →
Add source → Connect knowledge base → Linear**, enters and verifies the Key, checks the
returned workspace, selects up to 100 projects, and confirms the sharing notice.
Only projects accessible to the Key can be selected.

Imported content is visible to readers of the Dory knowledge model, including readers
without access to the original in Linear. Confirm that the selected material is suitable
for that audience. The Key is submitted to the server, encrypted at rest, and never
returned by the setup/save APIs. The input clears after saving or closing the dialog.

Each knowledge model has at most one connector per Linear workspace. Credentials are
shared only within the same Dory organization and Linear workspace. **Update API Key**
validates a replacement before saving; a failed validation leaves the original intact.
The replacement must match the connector's workspace. Updating a shared Key immediately
queues every associated connector. Disconnecting one connector deletes its managed
sources and leaves other models and the shared credential intact.

First connection, project selection changes, and successful Key updates queue a sync
immediately. A Node worker scans every minute and schedules a full snapshot every hour,
even when no knowledge page is open. **Sync now** queues a manual refresh. A running
self-hosted Node process is required; this scheduler does not support ephemeral serverless
workers. Desktop pauses while closed or asleep and performs one due catch-up sync after
starting or resuming (within the next scan), without replaying each missed hour.

Network, server, and rate-limit failures use persisted delayed retries, up to five
attempts per round, including GraphQL `RATELIMITED` responses. Leases and heartbeats
support multiple instances and recover abandoned tasks after five minutes. Updating the
Key, changing scope, or disconnecting fences previous work so it cannot commit stale data.

Snapshots commit transactionally only after all selected projects and all document pages
have been read successfully. Unchanged sources keep their identity and timestamps;
renames update titles. Deleted documents and documents moved outside the selected scope
are removed only on a successful complete sync. Removing a project from the selection
cleans up its sources on that next successful sync. An inaccessible or deleted selected
project causes an error and preserves previous content; the admin must restore access
or remove it from the selection. Archives remain included. Each source is limited to 10 MB.

## Troubleshooting

- **Not configured:** Web/Docker need a persistent 32-byte base64 `DS_SECRET_KEY`.
  Restart after changing configuration. Desktop manages it automatically.
- **Update API Key:** the Key was rejected or revoked. Existing content and last success
  remain available. An admin must enter a valid Key for the same workspace. Rejection
  from an old in-flight request cannot invalidate a newer credential version.
- **Project unavailable:** check the Key's access or remove that project from the selection.
  Missing access, partial GraphQL errors, pagination failures, and size limits never
  clear previously synced content.
- **Rate limited / synchronization error:** check the card's error and last success.
  Transient failures retry automatically; use **Sync now** to start a new round after
  the retry limit. Regular hourly scheduling continues while the Key is active.
- **No automatic updates:** keep the Node service or Desktop running and check server
  database access/migrations. A closed browser page does not stop the worker. Desktop
  may take up to one scan after waking to enqueue overdue work.
- **Encryption key changed:** restore the original key or update the Linear Key. Do not
  rotate `DS_SECRET_KEY` without migrating other Dory encrypted secrets too.

Before release, verify a real Linear workspace: Key validation, document pagination,
revocation/replacement, hourly sync, and Desktop restart/resume. Automated mocks are
recorded separately and do not count as a real Linear integration test.

References: [API Key authentication](https://linear.app/developers/graphql),
[pagination](https://linear.app/developers/pagination),
[rate limits](https://linear.app/developers/rate-limiting).

## Review knowledge extracted after synchronization

New Linear and GitHub connectors enable automatic extraction by default. Existing
connectors remain off after migration; an owner/admin can enable and backfill sources.
Successful synchronization queues independent AI extraction jobs. Metrics and business
rules become drafts with exact source evidence and require review before Agent use.
Source changes preserve published knowledge and mark it for review. See
[extraction and review](knowledge-extraction.md) for configuration, review and recovery.
