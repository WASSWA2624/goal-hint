# 235 · Uniform control rows and faint floating borders

- Match buttons, links, custom/native selects and date pickers to the visible
  floating input body: 40px normally and 44px on touch devices.
- Align top and bottom edges independently of label reserves and helper text.
- Replace legacy compact toolbar height overrides with shared geometry.
- Use theme-owned, very faint neutral outlines, including when a white field
  shares its parent background. Preserve transparent labels and border notches.
- Keep focus/error outlines thin, with a subtle state tint and no duplicate ring.
- Preserve the concurrent rail/select-fill work and existing stashes/worktrees.

Verify shared mixed rows and real Best Slips, Matches, builder, analytics and
owner controls at phone, tablet and desktop widths in both themes, including
pointer-coarse devices. Run lint, TypeScript/build and relevant regression tests.

## Verification

- Full lint, optimized application build and TypeScript compilation passed.
- 34 focused tests passed, including faint-outline palette assertions.
- Mixed rows passed at 320/390/768/1024/1440px in light/dark mode; touch
  cases confirmed 44px bodies, with 40px bodies on fine-pointer devices.
- 30 real row cases passed across Best Slips, Matches, Slip Builder, analytics
  and referral links at phone, tablet/desktop boundary and desktop widths.
- 768 existing floating-label regression assertions passed, preserving border
  gaps, placeholder suppression, focus handling, native fields and steppers.
