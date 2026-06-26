# Dory Roadmap

## Vision

Dory is building the data workspace for the Agent era.

As AI agents become capable of writing SQL, exploring schemas, debugging queries, and answering analytical questions, the bottleneck is no longer only whether an agent can generate a query. The harder problem is how humans and agents work together around real data: how queries are executed, how results are inspected, how mistakes are corrected, how context is preserved, and how useful work can continue after the first answer.

Dory is designed as an agent-first SQL workspace where every important operation is action-based and can be used by both humans and agents. Agents can list connections, explore schemas, run read-only SQL, create or update workspace tabs, and organize saved queries through the same underlying action system that powers the product UI.

We believe the future data workflow will not be a standalone chatbot beside a database. It will be a shared working environment where an agent can create a complete analytical workspace, produce SQL and result sets, and let the user open, inspect, filter, chart, edit, and continue the work directly.

In Dory, the result is not just text. SQL tabs, query results, filters, charts, saved queries, and workspace state are first-class parts of the workflow. This makes Dory different from simply connecting an LLM to a database through MCP: the agent does not just return an answer — it creates a real workspace that humans can trust, modify, and build on.

Our long-term goal is to make Dory the default data workbench for agentic data analysis:

- agents can understand database structure and execute safe analytical actions;
- humans can review and refine the agent’s work in a real SQL workspace;
- every meaningful step can be recorded, reopened, and continued;
- query results can become charts, dashboards, exports, or reusable analysis artifacts;
- external agents such as coding assistants can use Dory as their data execution layer through MCP.

Dory is not trying to replace SQL professionals with a black-box assistant. It is building the interface where humans and agents collaborate on data with transparency, control, and persistent context.

This document describes Dory's current product direction and the work we are prioritizing now.

The earlier public roadmap in [GitHub Discussion #35](https://github.com/dorylab/dory/discussions/35) remains useful background: Dory is still building toward an AI-native SQL workspace with stronger exploration, broader database support, and better workflows around modern analytical databases. The current roadmap narrows that direction around Agent Runs.

## Current Focus: Agent Runs

Dory's main product work is now centered on Agent Runs.

An Agent Run is a durable record of an external agent's work inside Dory. When a user asks an agent to investigate data, write SQL, inspect schemas, or prepare an analysis, Dory should not treat that as a one-off chat transcript. It should become a workspace-backed run with a clear question, selected data source, generated SQL, result snapshots, workspace tabs, activity history, and a concise final summary.

The goal is to make agent work inspectable, resumable, and useful after the agent finishes.

Agent Runs are designed to connect three parts of Dory:

- The MCP interface that lets external agents use Dory data tools.
- The SQL workspace where generated queries, tabs, and results can be reviewed.
- The product UI where users can browse, reopen, continue, or delete previous agent work.

## What Agent Runs Should Do

Agent Runs should give every meaningful agent task a stable work context.

Each run should capture:

- The original user question or task title.
- The data source used by the agent.
- The `workId` that ties later tool calls back to the same run.
- Schema exploration and data discovery activity.
- SQL tabs created or updated by the agent.
- Read-only SQL executions and result snapshots.
- Human edits made after the run is opened in the workspace.
- A timeline of important actions and failures.
- A short user-facing summary when the run is finished.

This makes an agent's output auditable. Users should be able to answer: what data did the agent inspect, what SQL did it run, what changed in the workspace, and what conclusion did it reach?

## Product Goals

### 1. Make Agent Runs the default unit of agent work

External agents should create or reuse one Agent Run for each user task, then pass the same `workId` through later Dory MCP calls. This keeps schema exploration, SQL execution, tab updates, saved-query changes, and final summaries attached to one coherent record.

Near-term work:

- Keep the MCP tool contract explicit: create a run first, then reuse its `workId`.
- Improve guardrails when a tool call is missing or mixing work context.
- Make run titles concise and readable from the original user request.
- Preserve links from tool responses back to the Dory workspace.

### 2. Make runs easy to review

The Agent Runs list and detail views should become the user's activity center for agent work.

Near-term work:

- Show the question, data source, status, and last activity clearly in the run list.
- Provide a detail page with summary, key metrics, and a chronological activity timeline.
- Expose SQL executions, tab updates, schema exploration, saved-query activity, and errors in plain language.
- Keep raw input/output details available where they help users debug agent behavior.

### 3. Make agent work resumable

An Agent Run should not end when the first agent response ends. Users should be able to open the generated workspace, edit SQL, save their changes, and hand the current state back to an external agent.

Near-term work:

- Open a run directly into the related SQL workspace.
- Hydrate the workspace from the run's tabs and latest result snapshots.
- Record human workspace saves as run activity.
- Generate a handoff prompt that instructs the external agent to continue from the existing `workId` and current workspace state.

### 4. Keep Dory's data workflow inspectable and safe

Agent Runs should make AI assistance more trustworthy by showing the steps behind it. Dory should favor read-only database access for agent SQL execution and keep persistence logic in the existing database and connection layers.

Near-term work:

- Keep agent SQL execution read-only by default.
- Store run, event, tab, and result state through the Dory database layer.
- Keep connection-backed behavior routed through the connection layer.
- Make failures visible in the run timeline instead of hiding them inside agent output.

### 5. Connect Agent Runs to the broader workspace

Agent Runs should strengthen the rest of Dory rather than becoming a separate product surface.

Near-term work:

- Reuse the existing SQL console, tabs, result previews, saved queries, and data-source UI.
- Let generated queries become reusable workspace artifacts when users decide they are useful.
- Keep Desktop and Web self-hosting behavior aligned through the shared runtime model.
- Continue improving exploration, visualization, autocomplete, schema summaries, and database compatibility where they directly improve Agent Runs.

## Longer-Term Direction

After the Agent Runs foundation is solid, Dory can build higher-level workflows on top of it:

- Run comparison across repeated investigations.
- Re-running or refreshing a previous agent analysis.
- Sharing a run with teammates.
- Promoting selected run outputs into saved queries, charts, reports, or lightweight dashboards.
- Better evaluation of agent work quality, including SQL correctness, result coverage, and source traceability.
- More database drivers and richer metadata caching for faster agent exploration.
- Collaboration workflows where humans and agents move between the same SQL workspace without losing context.

## Feedback

Dory is still evolving quickly. Feedback is especially useful around Agent Runs:

- What should every run capture?
- What makes an agent-generated SQL result trustworthy?
- Where should users be able to intervene, edit, or resume work?
- Which database workflows should agents handle first?

Please use GitHub discussions or issues to suggest changes, report confusing behavior, or share workflows that should become first-class Agent Run experiences.
