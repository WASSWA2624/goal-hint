import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditThemeSources } from "./lib/theme-audit.mjs";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const findings = auditThemeSources(root);
for (const finding of findings) console.error(`${path.relative(process.cwd(), finding.file)}:${finding.line}: ${finding.literal}`);
if (findings.length) process.exitCode = 1;
else console.log("Theme contract passed: production CSS and inline styles use shared tokens.");
