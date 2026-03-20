<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into the Studio Next.js app. The project already had a strong foundation (`instrumentation-client.ts`, `posthog-server.ts`, and several `posthog.capture` calls), so this pass focused on filling gaps: verifying the client init, setting environment variables correctly, adding missing connection lifecycle events, adding SQL console saved-query events, and building a PostHog dashboard with five business-critical insights.

**Changes made:**

- `apps/web/.env.local` — Set `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` to correct values via wizard-tools (never hardcoded)
- `apps/web/app/(app)/[organization]/connections/hooks/use-connect-connection.ts` — Added `posthog-js` import; capture `connection_opened` on success and `connection_open_failed` on error
- `apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/saved-queries/saved-queries-sidebar.tsx` — Added `posthog-js` import; capture `saved_query_opened` when a saved query is clicked, and `saved_query_deleted` when one is deleted

**Pre-existing events confirmed in place:**
- `user_signed_in` / `user_sign_in_failed` — `SignInForm.tsx`
- `user_signed_up` / `user_sign_up_failed` — `SignUpform.tsx`
- `connection_created` / `connection_updated` / `connection_deleted` — `use-connections.ts`
- `chat_message_sent` — `chatbox.tsx`
- `chat_session_created` / `chat_session_deleted` — `session-controller.ts`
- `sql_query_executed` (server-side) — `app/api/query/route.ts`

| Event | Description | File |
|---|---|---|
| `user_signed_in` | User signs in with email/password or OAuth | `app/(auth)/components/SignInForm.tsx` |
| `user_sign_in_failed` | Sign-in attempt fails, with error context | `app/(auth)/components/SignInForm.tsx` |
| `user_signed_up` | User completes sign-up and moves to verify stage | `app/(auth)/components/SignUpform.tsx` |
| `user_sign_up_failed` | Sign-up attempt fails with an error | `app/(auth)/components/SignUpform.tsx` |
| `connection_created` | New database connection created | `app/(app)/[organization]/connections/hooks/use-connections.ts` |
| `connection_updated` | Existing database connection updated | `app/(app)/[organization]/connections/hooks/use-connections.ts` |
| `connection_deleted` | Database connection deleted | `app/(app)/[organization]/connections/hooks/use-connections.ts` |
| `connection_opened` | User successfully opens/connects to a connection | `app/(app)/[organization]/connections/hooks/use-connect-connection.ts` |
| `connection_open_failed` | User fails to open/connect to a connection | `app/(app)/[organization]/connections/hooks/use-connect-connection.ts` |
| `chat_message_sent` | User submits a message in the AI chatbot | `app/(app)/[organization]/[connectionId]/chatbot/thread/chatbox.tsx` |
| `chat_session_created` | New chat session created | `app/(app)/[organization]/[connectionId]/chatbot/core/session-controller.ts` |
| `chat_session_deleted` | Chat session deleted | `app/(app)/[organization]/[connectionId]/chatbot/core/session-controller.ts` |
| `saved_query_opened` | User opens a saved query in the SQL console | `app/(app)/[organization]/[connectionId]/sql-console/components/saved-queries/saved-queries-sidebar.tsx` |
| `saved_query_deleted` | User deletes a saved query | `app/(app)/[organization]/[connectionId]/sql-console/components/saved-queries/saved-queries-sidebar.tsx` |
| `sql_query_executed` | Server-side: SQL query executed via API, with duration and row count | `app/api/query/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/339871/dashboard/1354347
- **User Signup to SQL Execution Funnel** (conversion funnel): https://us.posthog.com/project/339871/insights/dvPllVaA
- **Daily Active Users - Sign-ins & Sign-ups** (DAU trend): https://us.posthog.com/project/339871/insights/VwxHrACk
- **SQL Queries & AI Chat Activity** (feature usage): https://us.posthog.com/project/339871/insights/CA1VBokB
- **Connection Churn - Created vs Deleted** (churn signal): https://us.posthog.com/project/339871/insights/Sf880SUs
- **Auth Failure Events** (sign-in/sign-up failure monitoring): https://us.posthog.com/project/339871/insights/EarYb2YF

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/posthog-integration-nextjs-pages-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
