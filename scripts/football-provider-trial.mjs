import { executeTrialCommand, TrialCommandError } from "../src/server/football/provider-trial-command.ts";

const [action, ...argumentsList] = process.argv.slice(2);
const options = {};
try {
  if (!["init", "report", "run"].includes(action)) throw new TrialCommandError("invalid-arguments");
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index], value = argumentsList[index + 1];
    const field = { "--directory": "directory", "--plan": "planFile", "--authority": "authorityFile" }[flag];
    if (!field || typeof value !== "string" || value.startsWith("--") || options[field] !== undefined) throw new TrialCommandError("invalid-arguments");
    options[field] = value;
  }
  const outcome = await executeTrialCommand({ action, directory: ".tmp/provider-trial", ...options });
  console.log(`Provider trial: ${outcome.reason}. Suitability: ${outcome.report.liveSuitability}.`);
  console.log(`Report: ${outcome.reportFile}`);
  console.log(`JSON: ${outcome.jsonFile}`);
  if (action === "run" && outcome.reason !== "completed") process.exitCode = 2;
} catch (error) {
  console.error(error instanceof TrialCommandError ? error.message : "Provider trial unavailable; private input and storage diagnostics are withheld.");
  console.error("Usage: npm run trial:football -- init|report|run [--plan private-plan.json] [--directory private-directory] [--authority trusted-authority.mjs]");
  process.exitCode = 1;
}
