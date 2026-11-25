# Document-based knowledge upgrade

Migration 0050 permanently removes OSSIE models, structured definitions and rules, extraction candidates, review evidence, and publication history. It preserves the Markdown guide, documents, folders, connectors, document generation tasks, and verified SQL with its linked sources. YAML and TXT files are available as read-only source material.

Before upgrading a self-hosted installation, stop all Dory instances and workers and back up the application database. Desktop users can back up the local workspace with Dory closed. Start the new version to apply the migration. To roll back, restore the pre-upgrade database before starting the older version.
