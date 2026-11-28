import "server-only";

import type { UserDirectoryQuery } from "../../domain/user-directory.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { plansServiceFor } from "../members/plans.ts";
import { readUserDirectory } from "./user-directory.ts";
import { createUsers } from "./users.ts";

const initialWorkspaceDeadlineMs = 8_000;

/** Seed each workspace region independently within one initial render budget. */
export async function readUserWorkspace(database: DatabaseRuntime | null, query: UserDirectoryQuery,
  page: number, id: string | null, { deadlineMs = initialWorkspaceDeadlineMs } = {}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<undefined>(resolve => {
    timer = setTimeout(() => resolve(undefined), deadlineMs);
  });
  try {
    const directory = database ? Promise.race([readUserDirectory(database, query, page).catch(() => null), deadline]) : Promise.resolve(null);
    const plans = database ? Promise.race([plansServiceFor(database).list().catch(() => null), deadline]) : Promise.resolve(null);
    // An explicit account link still resolves when the filtered list cannot load.
    const target = id ?? (await directory)?.accounts[0]?.id;
    const detail = target && database ? Promise.race([createUsers(database).detail(target).catch(() => undefined), deadline])
      : Promise.resolve(target ? undefined : null);
    const [list, planList, account] = await Promise.all([directory, plans, detail]);
    const { accounts, adminPhone, asOf, ...initialPaging } = list ?? { accounts: [], adminPhone: undefined, asOf: undefined, page: 1, pages: 1, total: 0 };
    return {
      accounts, detail: account ?? null, plans: planList ?? [], initialPaging,
      ...(id ? { selectedExplicitly: true } : {}),
      ...(target ? { initialAccountId: target } : {}),
      ...(adminPhone ? { initialAdminPhone: adminPhone } : {}),
      ...(asOf ? { initialDirectoryAsOf: asOf } : {}),
      ...(list ? {} : { initialDirectoryError: "Users could not be loaded. Try again.", initialRequestedPage: page }),
      ...(planList ? {} : { initialPlansError: "Subscription plans could not be loaded. Try again." }),
      ...(account === undefined ? { initialDetailError: "User details could not be loaded. Try again." } : {}),
      ...(id && account === null ? { initialDetailError: "This user could not be found." } : {}),
    };
  } finally {
    clearTimeout(timer);
  }
}
