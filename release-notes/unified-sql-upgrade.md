# Saved SQL and Verified Queries

Migration 0051 gives each SQL query a shared title, description and body. My Queries retains personal folders and ordering. A knowledge base stores its own business question and source documents for each query it includes. Saving in the console defaults to My Queries. Select a knowledge base to share the same SQL.

When upgrading, Dory keeps existing links, including Agent Run references. An explicit saved-query reference is merged only when the organization, connection, SQL, title and description match. Older workspace saves without that reference remain separate to preserve their contents and visibility.

Stop all Dory instances and workers and back up the application database before upgrading. For Desktop, close Dory and back up the local workspace. Deploy the new version to all instances together. To roll back after migration, stop the new version, restore the backup, and start the previous version.
