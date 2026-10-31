import { createReviewServer } from "../design/match-details-desktop/server.mjs";

const args = process.argv.slice(2), index = args.indexOf("--port");
const port = index === -1 ? 3111 : Number(args[index + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("--port must be between 1 and 65535");
const server = createReviewServer();
server.on("error", error => { console.error(`Match review server: ${error.code ?? "unable to start"}`); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => console.log(`Match details studio: http://127.0.0.1:${port}/`));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
