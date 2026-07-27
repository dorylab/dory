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

---

# Schema Diff overflow and table-grid design QA

## Source of visual truth

- Card overflow annotation: `/var/folders/8t/5d4kjsy95pdb46sy3x204z8w0000gn/T/codex-clipboard-6d3cfc7e-1245-4631-93fd-f649a0754bbd.png`
- Card source pixels: 2764 × 1486
- Table-grid annotation: `/var/folders/8t/5d4kjsy95pdb46sy3x204z8w0000gn/T/codex-clipboard-aa5bffa1-b3b7-4488-bb2c-615d0e8f5137.png`
- Table source pixels: 2774 × 1334

## Implementation evidence

- Card full-value popover: `/tmp/schema-diff-card-popover.png`
- Table grid: `/tmp/schema-diff-table-grid.png`
- Table full-value popover: `/tmp/schema-diff-table-popover.png`
- Combined source/implementation comparison: `/tmp/schema-diff-design-qa-comparison.png`
- Browser viewport: 2048 × 1152 CSS px at 1× density
- Implementation captures: 2011 × 1152 px
- Density normalization: source and implementation panels were proportionally resized to 1200 px wide for the combined focused comparison.
- State: light theme, unsafe SQLite comparison fixture, Cards and Table views, `accounts.email` Source value open.

## Comparison history

### Pass 1

- P1: Source and Target values were clipped inside cards and table cells with no reliable way to inspect the full value.
- P1: Table rows only had faint horizontal treatment and no persistent vertical cell boundaries, making column ownership unclear.
- Fix: introduced a shared full-value popover with a visible expand affordance and formatted JSON content; applied fixed column widths plus explicit horizontal and vertical cell borders.

### Pass 2

- Full-view comparison: passed. Cards retain the same density while long values truncate cleanly inside their panels.
- Focused popover comparison: passed. Clicking a truncated card or table value opens the complete content in a bounded, scrollable layer; JSON is formatted for scanning.
- Table-grid comparison: passed. All tested data cells render a 1 px bottom border and the first five columns render a 1 px right border; the final column closes against the viewer border.
- Interaction check: passed. Cards/Table switching, card popover, table popover, and dismissal through another control work without console errors.

## Required fidelity surfaces

- Fonts and typography: existing mono treatment remains on database values; popover JSON uses the same mono family with readable line height.
- Spacing and layout rhythm: cards keep their existing dimensions; popovers are capped to the viewport and table columns use stable widths.
- Colors and visual tokens: borders, popover surfaces, focus rings, and muted labels use the existing theme tokens.
- Image and asset fidelity: no raster assets were required; the expand affordance uses the existing Lucide icon set already used by this screen.
- Copy and content: Source, Target, object, risk, and reason values are unchanged; the popover only reformats valid JSON for readability.

## Final result

passed

---

# Schema Compare navigation and AI Review design QA

## Source of visual truth

- User screenshot: `/var/folders/8t/5d4kjsy95pdb46sy3x204z8w0000gn/T/codex-clipboard-1e4df4f2-b96b-461c-a4f4-6c3cf9e75c83.png`
- Source pixels: 2556 × 1576
- Relevant source state: light theme, failed AI Review with a black robot icon and raw structured-output validation details

## Implementation evidence

- AI Review success state: `/Users/jeffrey/Documents/Code/agents/.tmp/schema-compare-ai-review-fixed.jpg`
- Connection-scoped navigation: `/Users/jeffrey/Documents/Code/agents/.tmp/schema-compare-connection-nav-fixed.jpg`
- Combined source/implementation comparison: `/Users/jeffrey/Documents/Code/agents/.tmp/schema-compare-ai-review-comparison.png`
- Browser viewport and implementation screenshots: 1280 × 720 CSS px at 1× density
- Combined comparison pixels: 1280 × 1182
- Density normalization: the source AI Review region was cropped from the 2556 × 1576 screenshot and proportionally resized to 1280 px wide; the implementation was captured at its native 1280 px width
- State: light theme, organization-level comparison detail, completed AI Review; connection-level SQL Console for navigation verification

## Comparison history

### Pass 1

- P1: AI Review failed because the model was not instructed to return the five required top-level JSON fields, and the UI exposed the resulting Zod issue array.
- P2: The AI Review heading used a generic black robot icon instead of Dory's violet AISpark icon.
- P2: Schema Compare remained visible inside connection-scoped navigation, where the requested information architecture only calls for connection tools.
- Fix: added an exact JSON output contract and compatible wrapper parsing, replaced the raw error with a localized retry state, reused `AISparkIcon`, and removed Schema Compare from the connection-scoped navigation branch only.

### Pass 2

- Full-view comparison: passed. AI Review now completes with a summary, change-ID evidence, recommendations, and limitations instead of exposing validation internals.
- Focused icon comparison: passed. The existing AISpark icon renders at 20 × 20 CSS px in `rgb(148, 96, 255)`.
- Navigation comparison: passed. The organization-level Data Sources page retains Schema Compare; the connection-level SQL Console shows SQL Console, Explorer, and Chatbot without Schema Compare.
- Interaction check: passed. Retrying the previously failed comparison produced a successful persisted AI Review.

## Required fidelity surfaces

- Fonts and typography: existing Dory heading, body, evidence-ID, and muted-description styles are preserved.
- Spacing and layout rhythm: the existing AI Review Card geometry is unchanged; the icon replacement does not alter heading alignment.
- Colors and visual tokens: the AI icon now uses the existing AISpark violet `#9460FF`; all other Card and status colors continue to use the theme system.
- Image and asset fidelity: the implementation reuses the product's existing `AISparkIcon`; no custom or approximate asset was introduced.
- Copy and content: raw validation internals are removed from the user-facing state; successful output remains grounded in deterministic comparison evidence.

## Verification notes

- The reference and implementation intentionally show different AI states: the reference documents the bug, while the implementation evidence shows the requested successful state.
- No new runtime error appeared in the development log during navigation, retry, or success-state verification.

## Final result

passed

---

# Schema Compare card header design QA

## Source of visual truth

- User screenshot: `/var/folders/8t/5d4kjsy95pdb46sy3x204z8w0000gn/T/codex-clipboard-0d49b2bd-4008-4157-a05a-c260425a80a7.png`
- Source pixels: 1916 × 1276
- Focused normalized reference: `/Users/jeffrey/Documents/Code/agents/apps/web/.tmp/design-qa/schema-compare-card-header-reference-focused.png`

## Implementation evidence

- Browser-rendered full view: `/Users/jeffrey/Documents/Code/agents/apps/web/.tmp/design-qa/schema-compare-card-header-default-light.png`
- Focused implementation: `/Users/jeffrey/Documents/Code/agents/apps/web/.tmp/design-qa/schema-compare-card-header-implementation-focused.png`
- Side-by-side focused comparison: `/Users/jeffrey/Documents/Code/agents/apps/web/.tmp/design-qa/schema-compare-card-header-comparison-focused.png`
- Browser viewport and screenshot: 1280 × 720 CSS px at 1× density
- Focused comparison: both sides normalized to 1008 × 296 px; the 1916 × 1276 source was proportionally resized to 1008 px wide and cropped to the same visible header region
- State: light theme, Cards view, unsafe SQLite fixture with low- and high-risk changes

## Comparison history

### Pass 1

- P2: The risk badge occupied a third header row on the left, while inherited Card padding and gap made the header approximately 98 CSS px tall.
- Fix: changed the header to an explicit horizontal flex layout, moved the risk badge to the right, removed inherited outer Card padding/gap, and set compact 20 px horizontal / 12 px vertical header padding.

### Pass 2

- Focused comparison: passed. Each header is 65 CSS px tall; the object path and change metadata remain left-aligned while the risk badge is right-aligned with a stable trailing inset.
- Full-view comparison: passed. Two-column card density is preserved and the before/after content starts materially closer to the header.
- Interaction check: passed. Table view opens and Cards view restores the compact headers.

## Required fidelity surfaces

- Fonts and typography: existing Dory mono object titles and small metadata hierarchy are preserved; no wrapping regression was observed.
- Spacing and layout rhythm: header height is reduced, padding is balanced, and the badge no longer creates an extra row.
- Colors and visual tokens: existing themed semantic risk colors and Card tokens are unchanged in light and dark themes.
- Image and asset fidelity: this component contains no raster imagery or custom assets; existing library icons are unchanged.
- Copy and content: object path, object/change metadata, risk value, Current/Desired labels, and reason text are unchanged.

## Verification notes

- Browser console contained existing sidebar/theme hydration warnings; no Schema Diff card-specific runtime error was observed.
- Automated coverage passed for card header height, right-side badge placement, Cards/Table/Chart switching, filtering, export, and theme changes.

## Final result

passed
