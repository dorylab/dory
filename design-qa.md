# Design QA

**Source visual truth**

- `/var/folders/8t/5d4kjsy95pdb46sy3x204z8w0000gn/T/codex-clipboard-266f84c1-e886-482d-9949-8f3ce9971eeb.png`
- Source pixels: 3024 × 1646 at approximately 2× density.
- Normalized source size: 1512 × 823, matching the implementation CSS viewport.

**Implementation evidence**

- `test-results/design-qa-unified-surfaces-dark.png`
- `test-results/design-qa-unified-inspector-dark.png`
- `test-results/design-qa-sidebar-gutter-dark.png`
- Unified-surface implementation pixels and CSS viewport: 1512 × 823 at device pixel ratio 1.
- Latest gutter implementation pixels and CSS viewport: 1280 × 720 at device pixel ratio 1; the source was center-cropped to the same frame for comparison.
- Latest side-by-side comparison: `test-results/design-qa-sidebar-gutter-side-by-side.png`.
- State: dark theme, `users` Data tab, row 88 `name` edited, pending-changes editor open.

**Findings**

- No actionable P0/P1/P2 differences for the requested change.
- The application sidebar, SQL table list, data grid, pending-changes editor, and Cell Inspector all resolve to the same opaque `card` surface.
- The application sidebar and SQL table list are separated by a 6px `muted/40` gutter instead of a 1px rule; the gutter reads as layout spacing rather than another panel.
- The pending-change card uses the darker `background` surface, leaving one intentional content layer instead of a third structural-panel color.
- Muted backgrounds remain limited to compact controls and table headers.
- Typography, spacing, footer density, borders, radii, and semantic edit colors remain unchanged.
- No image assets were added or replaced. Existing icons and branding remain unchanged.
- Copy and interaction labels remain unchanged.

**Interaction verification**

- Opened the pending-changes editor and confirmed all five primary surfaces share the exact computed color `lab(7.78201 -0.0000149012 0)` with opacity `1`.
- Confirmed the sidebar gutter is exactly 6px wide, uses the existing `muted` token at 40% opacity, and the SQL sidebar itself has no left border.
- Confirmed the pending-change card resolves to the distinct darker color `lab(2.75381 0 0)`.
- Switched to light theme and confirmed the existing white surfaces, border hierarchy, and opacity remain intact.
- At 900 × 720, confirmed no document-level horizontal overflow; the compact footer retains its internal horizontal scrolling.
- Closed the editor, opened Cell Inspector, and confirmed identical color, full-height bounds, and mutual exclusion.
- No browser console errors were present; existing development warnings were unrelated.

**Comparison history**

- Pass 1: P2 — the source used three competing structural backgrounds: near-black table list, dark-card data surface, and a noticeably lighter right panel.
- Pass 2: resolved — structural surfaces now share one `card` token, with `background` reserved for the inner change card; no remaining P0/P1/P2 findings.
- Pass 3: P2 — matching adjacent sidebar surfaces lost their boundary, while a 1px divider felt inconsistent with the product's broader splitter rhythm.
- Pass 4: resolved — replaced the line with a 6px theme-aware gutter matching the existing workspace spacing scale; no remaining P0/P1/P2 findings.

**Implementation checklist**

- [x] Use one opaque token for all primary workspace surfaces.
- [x] Keep one distinct inner-card layer.
- [x] Preserve table headers and interactive state colors.
- [x] Verify dark, light, and narrow viewport behavior.
- [x] Preserve editor and Inspector sizing and interaction behavior.
- [x] Separate adjacent sidebar surfaces without a 1px rule or a new large-area color.

final result: passed
