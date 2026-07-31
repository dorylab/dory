# Commit Dialog and Atomic Tooltip Design QA

## Evidence

- Source visual truth: `/var/folders/8t/5d4kjsy95pdb46sy3x204z8w0000gn/T/codex-clipboard-27d8bf79-3132-4d4e-8435-01a7db540d5c.png`
- Atomic tooltip screenshot: `/tmp/dory-atomic-tooltip-dark.png`
- Commit dialog screenshot: `/tmp/dory-commit-dialog-dark.png`
- Combined source/tooltip/dialog comparison: `/tmp/dory-commit-dialog-comparison.png`
- Implementation viewport: 1280 × 720 at device scale factor 1.

## Visual comparison

The source highlights two stacked borders around the SQL preview and a persistent atomic-transaction note above the panel actions. The implementation removes the SQL preview's outer surface while retaining the code block's own border, syntax highlighting, copy action, radius, and scrolling. The atomic note appears as a compact tooltip above the Commit All button instead of consuming a permanent footer row.

The final dark-theme capture uses the shared 75% black AlertDialog overlay. After the dialog's open animation completes, the dialog remains legible and visually separated while the table and pending-changes panel recede consistently.

## Findings

- No actionable P0, P1, or P2 differences remain for the requested changes.
- SQL preview: one border remains; the outer border, fill, radius, and 1px padding are removed.
- Tooltip: the transaction guarantee is absent from the static footer and appears on both hover and keyboard focus.
- Dialog depth: the dark overlay clearly subordinates the background without changing dialog border or shadow styling.
- Layout: removing the persistent hint compacts the action footer without changing Clear All or Commit All placement.
- Theme consistency: existing Dory code block, Tooltip, AlertDialog, and button components are reused.
- Assets: no new image or icon assets are required.

## Interaction checks

- [x] Commit All hover opens the atomic transaction tooltip.
- [x] Commit All keyboard focus opens the same tooltip.
- [x] Commit confirmation retains SQL scrolling and copy control.
- [x] Commit, cancel, conflict retention, and clear-all behavior remain intact.
- [x] Shared AlertDialog overlay uses the stronger dark-theme opacity.

final result: passed
