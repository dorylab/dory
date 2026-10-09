# Knowledge + Apache Ossie 0.1.1 Acceptance Plan

[English](./knowledge-ossie-acceptance.md) | [简体中文](./knowledge-ossie-acceptance-cn.md)

## Goal

Verify that Knowledge is not merely an editable catalog. It must provide observable, repeatable, and traceable semantic guidance throughout an analysis workflow:

1. Valid Ossie 0.1.1 YAML imports, displays, edits, and exports without losing information.
2. An Agent automatically selects relevant models for the active connection and question, then receives Metrics, Relationships, and AI Context.
3. The Agent generates SQL and answers that follow the defined business semantics.
4. Every Agent Run records the exact semantic-model specification version, content revision, matched constructs, and a deep link to Knowledge.
5. An unavailable model fails open: analysis continues, the failure is observable, and unrelated or unverified models do not pollute context.

## Canonical evaluation data

The repository provides deterministic, synthetic, Northwind-style commerce operations data. Its random seed is fixed, so rebuilding it always produces the same answers.

| Dataset           | Grain                       |      Fixed size | Primary purpose                               |
| ----------------- | --------------------------- | --------------: | --------------------------------------------- |
| `customers`       | one row per customer        |           1,200 | acquisition, region, segment, repeat purchase |
| `products`        | one row per SKU             |              48 | six product categories                        |
| `orders`          | one row per order           |           8,000 | GMV, revenue, orders, AOV, refunds            |
| `order_items`     | one row per order line      | more than 8,000 | order-to-product bridge                       |
| `payments`        | one row per payment attempt |  at least 8,000 | provider, retries, success rate, incident     |
| `support_tickets` | one row per ticket          |           1,800 | priority, resolution time, backlog incident   |
| `events`          | one row per event           |          36,000 | acquisition and funnel exploration            |

The companion Knowledge Model is a native Apache Ossie 0.1.1 document with:

- 7 datasets with complete field definitions;
- 8 metrics;
- 7 relationships with column mappings;
- English and Chinese synonyms, example questions, and business instructions;
- Dory `COMMON` extensions for verified status, stable IDs, and connection binding;
- 5 adjacent Verified Queries plus metric glossary, operating calendar, and incident-context Knowledge Sources.

## Golden questions and expected results

| Scenario           | User question                                                                           | Required semantic matches                           | Golden result                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Monthly operations | What are the 2026 monthly net-revenue, order-count, and AOV trends?                     | `net_revenue`, `order_count`, `average_order_value` | 6 rows; January net revenue = 189,376.21; June = 181,273.27                                        |
| Payment incident   | Which payment provider had an abnormal failure rate from 2026-05-11 through 2026-05-17? | `payment_success_rate`, `payments_order`            | `atlas_pay`: 14 / 38 failed, 36.84%; other providers: 6.82% and 2.33%                              |
| Category refunds   | Which product category has the highest refunded-amount share?                           | `refund_rate`, both order-item bridge relationships | `Premium Wearables` first at 23.11%                                                                |
| Channel retention  | How do purchase conversion and repeat purchase compare by acquisition channel?          | `repeat_purchase_rate`, `orders_customer`           | affiliate purchase rate = 95.42%; affiliate repeat purchase = 0%; every other channel is above 99% |
| Support backlog    | Did high-priority ticket resolution worsen in June 2026?                                | `ticket_resolution_hours`                           | critical is worst: 28 resolved tickets, 75.11 average hours                                        |

The machine-readable source for the questions, SQL, expected semantic IDs, and expected facts is [commerce-agent-evaluation-knowledge.ts](../../apps/web/lib/demo/commerce-agent-evaluation-knowledge.ts). Do not duplicate golden answers in tests.

## Prepare a local test environment

Start and sign in to local Dory, then make sure an organization exists. From the repository root, run:

```bash
yarn workspace web commerce:evaluation:seed --reset
```

The command:

- rebuilds `apps/web/localdata/commerce-agent-evaluation.sqlite`;
- creates or updates the `Commerce Agent Evaluation` SQLite connection;
- imports the `Commerce Operations Knowledge` Ossie 0.1.1 YAML while preserving verified status;
- creates four Knowledge Sources and five Verified Queries;
- outputs the `connectionId`, `knowledgeModelId`, `ossieVersion`, and full `modelRevision`.

Run it only against a development or test organization. `--reset` rebuilds this dedicated SQLite fixture and does not modify a business database.

## Test layers

### P0: contract and data correctness

Run:

```bash
yarn workspace web commerce:evaluation:test
yarn workspace web exec tsx --test ../../packages/database/scripts/tests/knowledge-model.test.ts
```

Acceptance criteria:

- The document passes the official Ossie 0.1.1 schema and the Dory profile.
- All evaluation definitions are verified and bound to one test connection.
- Dataset, metric, relationship, and column-mapping counts are correct.
- Every golden SQL query returns deterministic results.
- No foreign-key reference is broken.
- Contract regression includes bad versions, Cube YAML, multi-model documents, empty datasets, duplicate names, broken references, unequal relationship mappings, and round trips.

### P0: Knowledge UI

Check manually:

1. Open **Knowledge** and confirm no separate Ossie product section exists.
2. Open `Commerce Operations Knowledge` and confirm `Apache Ossie 0.1.1 · rev <8-char hash>` is visible.
3. In Definitions, verify the datasets, fields, eight metrics, seven relationships, and relationship-column mappings.
4. Verify AI Context instructions, synonyms, and examples.
5. Open YAML and confirm it is an Ossie document with no `cubes:` key.
6. Edit only a field description, save, and reopen YAML. Other dialects, AI Context, and extensions must remain intact.
7. Re-import formatting-only YAML and verify the revision stays unchanged. Change a metric expression and verify the revision changes.

Optional browser smoke test:

```bash
E2E_COMMERCE_EVALUATION=1 yarn test:e2e tests/e2e/commerce-agent-evaluation.spec.ts
```

### P0: automatic semantic context

For every golden question, create an Agent query. Before SQL generation, inspect the debug output or MCP response:

- `semanticContext` contains a dedicated `Semantic Model Context` section.
- The model name, Ossie specification version, and revision are present.
- The required metric, fields, relationship direction, and column mapping are present.
- Relevant instructions, synonyms, or examples are present.
- This base context is injected before the Agent explicitly searches or reads Knowledge.
- Repeated runs select models and truncate content deterministically.

MCP replay:

```bash
DORY_MCP_TOKEN=<read-only service-account token> \
DORY_COMMERCE_EVALUATION_CONNECTION_ID=<connectionId from seed output> \
yarn workspace web commerce:evaluation:mcp
```

The replay first calls `dory_create_work` and asserts that it automatically returns `payment_success_rate`, `payments_order`, Ossie 0.1.1, and a revision. Only then does it perform explicit asset discovery, schema exploration, SQL, Artifact, and finding steps.

### P0: Agent Run traceability

After MCP replay or UI Chat completes, open the corresponding Agent Run:

1. A Context card shows `Commerce Operations Knowledge · Ossie 0.1.1 · rev <8-char hash>`.
2. The card deep-links to the same Knowledge Model.
3. The snapshot includes matched metrics and relationships.
4. After a model change, a new run records a new revision; the old run still displays the old revision and snapshot.
5. If one run actually uses two model revisions, both asset references remain independently recorded.

### P1: isolation, relevance, and failure behavior

| Case                                         | Expected behavior                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Same metric name bound to another connection | Not injected                                                                                  |
| One ready model with no textual match        | Connection-level fallback is allowed                                                          |
| Multiple ready models with no positive match | No model is injected                                                                          |
| Synonym “payment success” matches            | `payment_success_rate` is selected                                                            |
| A full incident example matches              | Payment model and related relationship are selected                                           |
| Definition is unverified                     | Excluded from context                                                                         |
| Resolver throws                              | SQL/ordinary response continues; an error event is recorded; no semantic-model asset is added |
| Context exceeds budget                       | At most 3 models, 12 metrics, 12 datasets, and 16,000 characters; truncation is stable        |
| `cubes:` or an unsupported version imports   | A clear Apache Ossie 0.1.1-only error is returned                                             |

`apps/web/scripts/tests/semantic-model-context.test.ts` and the MCP facade suite cover the deterministic cases. Before release, manually sample connection isolation and fail-open behavior once each.

## Release gate

All P0 checks must pass before release. Preserve the following evidence:

- seed output: `connectionId`, `knowledgeModelId`, and `modelRevision`;
- answers, SQL, and Artifact links for all five golden questions;
- a screenshot of the payment-incident Agent Run Context card;
- automation results;
- for any failure, the layer: contract, retrieval, context, SQL, result, or traceability.

Do not accept a natural-language answer alone. Passing means correct semantic matches, correct SQL semantics, values that match the golden data, and a traceable model revision in the Agent Run.
