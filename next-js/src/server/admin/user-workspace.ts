import "server-only";

import type { UserDirectoryQuery } from "../../domain/user-directory.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { plansServiceFor } from "../members/plans.ts";
import { readUserDirectory } from "./user-directory.ts";
import { createUsers } from "./users.ts";

/** Seed each workspace region independently after the admin page gate. */
export async function readUserWorkspace(database: DatabaseRuntime | null, query: UserDirectoryQuery, page: number, id: string | null) {
  const directory = database ? readUserDirectory(database, query, page).catch(() => null) : Promise.resolve(null);
  const plans = database ? plansServiceFor(database).list().catch(() => null) : Promise.resolve(null);
  // An explicit account link still resolves when the filtered list cannot load.
  const target = id ?? (await directory)?.accounts[0]?.id;
  const detail = target ? database ? createUsers(database).detail(target).catch(() => undefined) : Promise.resolve(undefined)
    : Promise.resolve(null);
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
}
