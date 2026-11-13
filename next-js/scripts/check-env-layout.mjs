import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

const assignments = /^([A-Z_][A-Z0-9_]*=)[^\r\n]*/gmu;
const layout = source => source.replace(assignments, "$1<value>");

export function matchesEnvLayout(template, profile) {
  return layout(template) === layout(profile)
    && Object.keys(parseEnv(template)).join("\n") === Object.keys(parseEnv(profile)).join("\n");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const template = read(".env.example");
  for (const [name, target] of Object.entries({
    ".env.development": "development", ".env.test": "staging", ".env.production": "production",
  })) {
    try {
      const profile = read(name);
      if (!matchesEnvLayout(template, profile) || parseEnv(profile).GOAL_HINT_DEPLOYMENT_ENVIRONMENT !== target) {
        console.error(`${name} differs from the template layout or expected environment identity.`);
        process.exitCode = 1;
      } else {
        console.log(`${name} matches .env.example (${target}).`);
      }
    } catch {
      console.error(`Could not read or parse ${name}.`);
      process.exitCode = 1;
    }
  }
}
