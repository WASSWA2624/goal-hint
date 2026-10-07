import { getRuntimePolicy } from "../src/server/config/runtime-policy.ts";

try {
  getRuntimePolicy();
  console.log("Runtime policy configuration is valid. Live operations still require verified evidence.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Runtime policy validation failed.");
  process.exitCode = 1;
}
