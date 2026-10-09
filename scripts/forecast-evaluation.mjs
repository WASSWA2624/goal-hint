import { runEvaluationCommand } from "../src/server/evaluation/evaluation-command.ts";

try {
  const outcome = await runEvaluationCommand(process.argv.slice(2));
  console.log(`Forecast evaluation: ${outcome.kind}. Promotion performed: false. Public claim authorized: false.`);
  console.log(`Report: ${outcome.markdownPath}`);
  console.log(`JSON: ${outcome.reportPath}`);
} catch {
  console.error("Forecast evaluation unavailable; private input, verifier and storage diagnostics are withheld.");
  console.error("Usage: npm run evaluation:report -- [--protocol private.json --dataset private.json --authority trusted.mjs --split finalTest] [--directory private-directory]");
  process.exitCode = 1;
}
