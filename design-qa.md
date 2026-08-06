# Design QA

**Source visual truth**

- `/var/folders/8t/5d4kjsy95pdb46sy3x204z8w0000gn/T/codex-clipboard-beb8c34a-7176-484d-a61e-1115d6f8a2ba.png`
- Source pixels: 3024 × 1646 at approximately 2× density.
- Normalized source size: 1512 × 823, matching the implementation CSS viewport.

**Implementation evidence**

- `test-results/design-qa-unified-surfaces-dark.png`
- `test-results/design-qa-unified-inspector-dark.png`
- Implementation pixels and CSS viewport: 1512 × 823 at device pixel ratio 1.
- Side-by-side comparison: `test-results/design-qa-unified-side-by-side.png`.
- State: dark theme, `users` Data tab, row 88 `name` edited, pending-changes editor open.

**Findings**

- No actionable P0/P1/P2 differences for the requested change.
- The application sidebar, SQL table list, data grid, pending-changes editor, and Cell Inspector all resolve to the same opaque `card` surface.
- The pending-change card uses the darker `background` surface, leaving one intentional content layer instead of a third structural-panel color.
- Muted backgrounds remain limited to compact controls and table headers.
- Typography, spacing, footer density, borders, radii, and semantic edit colors remain unchanged.
- No image assets were added or replaced. Existing icons and branding remain unchanged.
- Copy and interaction labels remain unchanged.

**Interaction verification**

- Opened the pending-changes editor and confirmed all five primary surfaces share the exact computed color `lab(7.78201 -0.0000149012 0)` with opacity `1`.
- Confirmed the pending-change card resolves to the distinct darker color `lab(2.75381 0 0)`.
- Switched to light theme and confirmed the existing white surfaces, border hierarchy, and opacity remain intact.
- At 900 × 720, confirmed no document-level horizontal overflow; the compact footer retains its internal horizontal scrolling.
- Closed the editor, opened Cell Inspector, and confirmed identical color, full-height bounds, and mutual exclusion.
- No browser console errors were present; existing development warnings were unrelated.

**Focused-region comparison**

- A separate crop was unnecessary because the requested change concerns large structural surfaces that remain clearly distinguishable in the normalized full-view comparison.

**Comparison history**

- Pass 1: P2 — the source used three competing structural backgrounds: near-black table list, dark-card data surface, and a noticeably lighter right panel.
- Pass 2: resolved — structural surfaces now share one `card` token, with `background` reserved for the inner change card; no remaining P0/P1/P2 findings.

**Implementation checklist**

- [x] Use one opaque token for all primary workspace surfaces.
- [x] Keep one distinct inner-card layer.
- [x] Preserve table headers and interactive state colors.
- [x] Verify dark, light, and narrow viewport behavior.
- [x] Preserve editor and Inspector sizing and interaction behavior.

## Data import return navigation

- Reference: `/var/folders/8t/5d4kjsy95pdb46sy3x204z8w0000gn/T/codex-clipboard-9d1d2a93-66ba-4d23-9577-e2a39005c47c.png`.
- Verified the page-based import wizard renders “Data import” as a left-arrow return link in the original header position.
- Verified the link returns to the current connection's `/import` history list.
- Verified the table-level import modal retains its non-navigation import label.
- No P0, P1, P2, or P3 differences remain in the scoped component.

final result: passed
