# GitHub Knowledge Connector

Dory can synchronize Markdown, YAML, and TXT documents from a GitHub.com repository into a knowledge model. Each connector follows one folder on the repository's default branch and treats GitHub as the source of truth.

## GitHub App setup

Create a GitHub App for the Dory deployment with these settings:

- Repository permission: **Contents — Read-only**
- Subscribe to events: **Push**, **Installation**, and **Installation repositories**
- Setup URL: `https://<your-dory-host>/api/knowledge/connectors/github/setup`
- Webhook URL: `https://<your-dory-host>/api/webhooks/github`
- Request user authorization (OAuth) during installation: disabled

The App can be private to one GitHub organization for an internal deployment, or public when users from other GitHub organizations need to install it.

Configure the Dory server with:

```dotenv
GITHUB_APP_ID=<github-app-id>
GITHUB_APP_SLUG=<github-app-slug>
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_APP_WEBHOOK_SECRET=<webhook-secret>
```

The private key and webhook secret must stay server-side. Restart or redeploy Dory after setting the variables.

## Synchronization behavior

After installing the App, a Dory workspace administrator selects an accessible repository and one folder. Dory recursively synchronizes `.md`, `.markdown`, `.yaml`, `.yml`, and `.txt` files up to 10 MB each.

- The first synchronization starts when the connector is created.
- **Sync now** queues a manual synchronization.
- Web deployments queue synchronization after pushes to the default branch.
- Removed files are removed only from the connector-managed knowledge sources.
- If a synchronization fails, Dory keeps the last successful content and displays the error.
- GitHub-managed sources are read-only in Dory. Edit them in GitHub and synchronize again.

## Desktop runtime

Dory Desktop supports manual synchronization only. It does not listen for inbound GitHub webhooks and does not include a GitHub App private key. The connector is available in Desktop only when the operator provides all GitHub App environment variables to the local web runtime.
