# Schema Graph design QA

## Source of visual truth

- Before-state screenshot: `/var/folders/8t/5d4kjsy95pdb46sy3x204z8w0000gn/T/codex-clipboard-14819104-233c-47b4-adb3-46978ae3fd38.png`
- Card reference screenshot: `/var/folders/8t/5d4kjsy95pdb46sy3x204z8w0000gn/T/codex-clipboard-f87badf8-4e0a-42c1-a5c1-63de22386d71.png`
- Compact-toolbar annotation: `/var/folders/8t/5d4kjsy95pdb46sy3x204z8w0000gn/T/codex-clipboard-215f29b9-9267-4053-961f-5529d8dfb862.png`

## Implementation evidence

- Inline Graph: `/Users/jeffrey/.codex/visualizations/2026/07/21/019f8386-cb36-7a72-afc8-b6f100c45a78/schema-graph-inline.png`
- Fullscreen Drawer: `/Users/jeffrey/.codex/visualizations/2026/07/21/019f8386-cb36-7a72-afc8-b6f100c45a78/schema-graph-fullscreen.png`
- Focused reference region: `/Users/jeffrey/.codex/visualizations/2026/07/21/019f8386-cb36-7a72-afc8-b6f100c45a78/reference-card-focus.png`
- Focused implementation region: `/Users/jeffrey/.codex/visualizations/2026/07/21/019f8386-cb36-7a72-afc8-b6f100c45a78/implementation-focus.png`
- Compact toolbar: `/Users/jeffrey/.codex/visualizations/2026/07/21/019f8386-cb36-7a72-afc8-b6f100c45a78/schema-graph-compact-toolbar.png`
- Viewport: 1280 × 720
- State: dark theme, Demo Database, SQLite `main`, Graph tab, three tables and one relationship

## Comparison history

### Pass 1

- P1: React Flow inherited no usable height after the compact spacing change, so the graph canvas rendered blank.
- Fix: made the graph workspace explicitly fill its available height.

### Pass 2

- Full-view comparison: passed. The Graph tab begins closer to the header, the toolbar remains readable, and the canvas fills the available explorer area.
- Focused card comparison: passed. Cards now use a structured header, schema and relationship count, field-type icons, right-aligned data types, and required-field markers.
- Relationship handles: passed. The demo graph contains exactly two rendered handles for its single relationship; ordinary columns render no endpoint circles.
- Fullscreen interaction: passed. The fullscreen Drawer opens, renders the same graph and controls, and closes back to the inline view.

### Pass 3

- P2 annotation: the toolbar had an unnecessary full-width card border and too much accumulated space below the tabs.
- Fix: removed the toolbar container border, radius, background, and padding; removed the tab-content margin and inline graph top padding.
- Post-fix evidence: the controls now sit directly above the bordered graph canvas, with a compact gap below the Graph/Tables/Views tabs.
- Interaction regression check: passed. Fullscreen opens and closes successfully after the layout refinement.

## Notes

- The implementation intentionally uses Dory's existing theme tokens rather than copying the reference's light palette.
- Existing development-console hydration messages originate in the sidebar theme entry and breadcrumb markup; no Schema Graph runtime error was observed during the tested interactions.

## Final result

passed
