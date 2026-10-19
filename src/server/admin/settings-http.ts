import "server-only";

import { protectedSettingFields, type SettingsPageData } from "../../domain/subscription-settings.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { clientAddress, clientAddressDiagnostics, json } from "../http/private-http.ts";
import { settingsServiceFor, type SettingsOutcome, type SettingsService } from "../members/settings.ts";
import { readJsonBody, type AdminContext } from "./admin-http.ts";

/** What the Settings page and `/api/admin/settings` show: the stored settings, what stops each mode, and the address headers. */
export async function settingsView(service: SettingsService, headers: Headers): Promise<SettingsPageData> {
  return { ...await service.overview(), protectedFields: protectedSettingFields, diagnostics: clientAddressDiagnostics(headers) };
}

const unavailable = () => json({ error: "unavailable", message: "Settings storage is unavailable. Try again shortly." }, 503);

/**
 * A saved change has already committed with its audit row, so the reply never calls it a failure. When the page data
 * cannot be read again, it carries the saved settings without `source` and `requirements`, and the page asks for a reload.
 */
async function savedReply(outcome: Extract<SettingsOutcome, { status: "saved" }>, service: SettingsService, headers: Headers): Promise<Response> {
  const saved = { changed: outcome.changed, cleared: outcome.cleared };
  try { return json({ ...await settingsView(service, headers), ...saved }); }
  catch { return json({ settings: outcome.settings, protectedFields: protectedSettingFields, diagnostics: clientAddressDiagnostics(headers), ...saved }); }
}

async function answer(outcome: SettingsOutcome, service: SettingsService, request: Request): Promise<Response> {
  switch (outcome.status) {
    case "saved": return savedReply(outcome, service, request.headers);
    case "invalid": return json({ error: "invalid", message: "Check the highlighted settings.", errors: outcome.errors }, 400);
    case "password-required":
      return json({ error: "password-required", message: "Enter your owner password to change payment and contact details.", fields: outcome.fields }, 403);
    case "requirements": return json({ error: "requirements", message: `Paid access cannot be ${outcome.mode === "test" ? "in test mode" : "on"} yet.`,
      mode: outcome.mode, missing: outcome.missing }, 409);
    case "password-refused": {
      const { check } = outcome;
      if (check.status === "locked") {
        return json({ error: "locked", message: `Too many wrong passwords. Try again in ${Math.max(1, Math.ceil(check.retryAfterSeconds / 60))} minutes.` },
          429, { "Retry-After": String(check.retryAfterSeconds) });
      }
      if (check.status === "invalid") return json({ error: "password-invalid", message: "That password is not right." }, 403);
      return json({ error: "unavailable", message: "Owner sign-in is unavailable, so protected settings cannot change now." }, 503);
    }
  }
}

/**
 * `GET` and `POST /api/admin/settings`, behind the admin guard. POST takes `{ action: "save", changes, password? }` or
 * `{ action: "mode", mode }`. Password re-entry is checked by the owner login against this request's address.
 */
export function createSettingsHandlers({ service = settingsServiceFor }: { service?: (database: DatabaseRuntime) => SettingsService } = {}) {
  return {
    async GET({ services, request }: AdminContext): Promise<Response> {
      if (!services.database) return unavailable();
      try { return json(await settingsView(service(services.database), request.headers)); } catch { return unavailable(); }
    },
    async POST({ services, owner, request }: AdminContext): Promise<Response> {
      if (!services.database) return unavailable();
      const read = await readJsonBody(request);
      if ("refusal" in read) return read.refusal;
      const { action } = read.body;
      const settings = service(services.database);
      try {
        if (action === "mode") return await answer(await settings.setMode(owner.username, read.body.mode), settings, request);
        if (action !== "save") return json({ error: "invalid-request", message: "Unknown settings action." }, 400);
        const password = typeof read.body.password === "string" && read.body.password !== "" ? read.body.password.slice(0, 1024) : null;
        const auth = services.auth;
        return await answer(await settings.save(owner.username, read.body.changes, { password,
          confirm: (typed) => auth ? auth.confirmPassword(owner.username, typed, clientAddress(request.headers)) : Promise.resolve({ status: "unavailable" }) }),
        settings, request);
      } catch { return unavailable(); }
    },
  };
}
