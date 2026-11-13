import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

export function readLocalEnvFile(directory, name) {
  try {
    return parseEnv(readFileSync(join(directory, name), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error(`Could not read local environment file ${name}.`);
  }
}

/** Give Next a defined empty value for inactive settings it would otherwise load implicitly. */
export function localWebEnvironment(mode, { directory = process.cwd(), source = process.env, owned = false, overlays = [] } = {}) {
  const development = readLocalEnvFile(directory, ".env.development");
  const selected = owned ? {} : { ...development };
  for (const name of overlays) Object.assign(selected, readLocalEnvFile(directory, name));
  const environment = { ...selected, ...source, NODE_ENV: mode };
  const inactive = [`.env.${mode}.local`, ".env.local", ".env"];
  if (mode === "production") inactive.push(".env.production");
  const excluded = inactive.map((name) => readLocalEnvFile(directory, name));
  // Next copies these source files verbatim into a standalone build even when every value is masked.
  if (mode === "production" && environment.BUILD_OUTPUT === "standalone" &&
      [".env", ".env.production"].some((name) => existsSync(join(directory, name)))) {
    throw new Error("Use npm run package:cpanel to build a standalone release without private environment files.");
  }
  if (owned) excluded.push(development);
  const masked = new Set(excluded.flatMap(Object.keys).filter((key) => !Object.hasOwn(environment, key)));
  for (const key of masked) Object.defineProperty(environment, key, { value: "", enumerable: true });
  environment.__GOAL_HINT_LOCAL_ENV_MASK = [...masked].join(",");
  return environment;
}

export const localProductionOverlays = [".goal-hint/local-environment/production-build.env"];
