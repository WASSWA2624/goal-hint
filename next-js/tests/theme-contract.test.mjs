import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { auditThemeSources, hardcodedVisuals } from "../scripts/lib/theme-audit.mjs";

test("production styles keep visual literals in the shared theme", () => {
  assert.deepEqual(auditThemeSources(path.resolve("src")), []);
});

test("the theme audit rejects local CSS and inline styling while preserving structural geometry", () => {
  const sample = 'const Card = styled.div`padding: 12px; color: #fff; border-radius: 8px; font-weight: 700;`;'
    + 'const view = <div style={{ gap: "6px", width: "100%", display: "grid" }} />;';
  assert.deepEqual(hardcodedVisuals(sample).map(finding => finding.literal), ["12px", "#fff", "8px", "font-weight: 700", "6px"]);
  assert.deepEqual(hardcodedVisuals('const Card = styled.div`padding: ${({ theme }) => `14px ${theme.space.sm}`};`;').map(finding => finding.literal), ["14px"]);
  assert.deepEqual(hardcodedVisuals('const Card = styled.div`padding: var(--gh-spacing-2); grid-template-columns: repeat(2,minmax(0,1fr)); opacity: 0;`;'), []);
});
