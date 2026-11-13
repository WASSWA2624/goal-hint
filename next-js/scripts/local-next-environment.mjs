import { localProductionOverlays, localWebEnvironment } from "./lib/local-web-environment.mjs";

const command = process.argv[2];
const mode = command === "dev" || (command !== "build" && command !== "start" && process.env.NODE_ENV === "development")
  ? "development" : "production";
const owned = mode === "development" && process.env.__GOAL_HINT_OWNED_LOCAL_WEB === "1";
const overlays = mode === "production" ? localProductionOverlays : [];
Object.assign(process.env, localWebEnvironment(mode, { owned, overlays }));
