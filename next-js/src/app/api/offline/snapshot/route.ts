import { createOfflineSnapshotHandler } from "../../../../server/offline/snapshot.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createOfflineSnapshotHandler();
