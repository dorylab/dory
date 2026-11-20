# Google Drive knowledge connections

Open **Knowledge sources → Google Drive**, authorize a Google account, browse to the folder to share and confirm its name. Each connection creates a read-only folder in **Documents**. Everyone who can read the knowledge base can read its synced content. **View in documents** opens that connection's folder.

## Deployment

Enable the Google Drive API in a Google Cloud project, configure the OAuth consent screen and create an OAuth client. During testing, add the Google account to the project's test users.

| Setting | Web self-hosting | Desktop |
| --- | --- | --- |
| OAuth client type | Web application | Desktop app |
| `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` | Set on every Dory server | Set in the local runtime environment |
| `GOOGLE_DRIVE_REDIRECT_URI` | Register the exact public HTTPS URL ending in `/api/knowledge/connectors/drive/callback` (HTTP localhost works for development) | Dory uses the local server's loopback address and port |
| `DS_SECRET_KEY` | Persistent base64-encoded 32-byte encryption key shared across replicas | Provided by the desktop runtime |

Run database migrations and restart Dory. Desktop opens Google in the system browser. The Dory window shows the folder selector once authorization succeeds. Refresh tokens are encrypted in application storage.

Google classifies `https://www.googleapis.com/auth/drive.readonly` as a restricted scope. This scope grants read access across Drive. Dory reads the chosen folder recursively for synchronization. Public external deployments must meet Google's verification requirements, including the security assessment when restricted data is stored or transmitted on a server. Confirm the requirements and exceptions for your deployment in [Google's Drive scope documentation](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

## Synchronization

Dory exports Google Docs as Markdown and reads Markdown files directly. It follows subfolders and skips shortcuts. Each saved document links back to its original. A file keeps its Dory ID after renaming or moving within the selected folder. Each scan supports up to 5,000 documents, 10 MB per document and 50 MB total content.

The initial scan starts when the connection is saved. The running server schedules hourly updates. Desktop runs the same worker while Dory is open. A failed or incomplete scan preserves the last successful content. Disconnecting removes the connection's copies from this knowledge base.

[Google Docs export formats](https://developers.google.com/workspace/drive/api/guides/ref-export-formats) · [Google desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app)
