import "server-only";

import type { DatabaseRuntime } from "../database/client.ts";
import { json } from "../http/private-http.ts";
import { plansServiceFor, type PlanOutcome, type PlansService, type PlanUsageOutcome } from "../members/plans.ts";
import { readJsonBody, type AdminContext } from "./admin-http.ts";

const unavailable = () => json({ error: "unavailable", message: "Plans storage is unavailable. Try again shortly." }, 503);

function answer(outcome: PlanOutcome | PlanUsageOutcome): Response {
  switch (outcome.status) {
    case "saved": return json({ plans: outcome.plans });
    case "usage": return json({ usage: outcome.usage });
    case "invalid": return json({ error: "invalid", message: "Check the plan details.", errors: outcome.errors }, 400);
    case "not-found": return json({ error: "not-found", message: "That plan does not exist. Reload the page." }, 404);
    case "in-use": return json({ error: "in-use", message: "This plan has payment, access or automatic-renewal records. Deactivate it to preserve that history.",
      usage: outcome.usage }, 409);
    case "requirements": return json({ error: "requirements", message: outcome.missing[0]?.message ?? "Paid access needs an active plan.",
      mode: outcome.mode, missing: outcome.missing }, 409);
  }
}

/**
 * `GET` and `POST /api/admin/plans`, behind the admin guard. POST takes `{ action, … }`: `create` (`plan`), `edit` (`id`,
 * `plan`), `activate` or `deactivate` (`id`), `reorder` (`ids`), `usage` (`id`) and `delete` (`id`, `confirmed: true`).
 */
export function createPlansHandlers({ service = plansServiceFor }: { service?: (database: DatabaseRuntime) => PlansService } = {}) {
  return {
    async GET({ services }: AdminContext): Promise<Response> {
      if (!services.database) return unavailable();
      try { return json({ plans: await service(services.database).list() }); } catch { return unavailable(); }
    },
    async POST({ services, owner, request }: AdminContext): Promise<Response> {
      if (!services.database) return unavailable();
      const read = await readJsonBody(request);
      if ("refusal" in read) return read.refusal;
      const { action, id, plan, ids, confirmed } = read.body;
      const plans = service(services.database);
      try {
        switch (action) {
          case "create": return answer(await plans.create(owner.username, plan));
          case "edit": return answer(await plans.edit(owner.username, id, plan));
          case "activate": case "deactivate": return answer(await plans.setActive(owner.username, id, action === "activate"));
          case "reorder": return answer(await plans.reorder(owner.username, ids));
          case "usage": return answer(await plans.usage(id));
          case "delete": return answer(await plans.remove(owner.username, id, confirmed));
          default: return json({ error: "invalid-request", message: "Unknown plan action." }, 400);
        }
      } catch { return unavailable(); }
    },
  };
}
