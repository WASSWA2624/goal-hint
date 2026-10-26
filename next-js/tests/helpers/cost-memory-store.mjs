import { costAttemptTotals } from "../../src/server/cost-control/cost-totals.ts";

/** Local commit/rollback and account locks; genuine MySQL acceptance lives separately. */
export function memoryCostStore(clock) {
  const ledgers = new Map(), locks = new Map();
  const copy = (value) => value === undefined ? null : structuredClone(value);
  function matches(attempt, filter) {
    return (!filter?.periodId || attempt.periodId === filter.periodId)
      && (!filter?.jobId || attempt.request.jobId === filter.jobId);
  }
  return {
    async transaction(accountId, category, operation) {
      const key = `${accountId}:${category}`, previous = locks.get(key) ?? Promise.resolve();
      let release;
      locks.set(key, new Promise((resolve) => { release = resolve; }));
      await previous;
      const state = structuredClone(ledgers.get(key) ?? {
        account: null, periods: new Map(), jobs: new Map(), attempts: new Map(),
      });
      const values = (filter) => [...state.attempts.values()].filter((attempt) => matches(attempt, filter));
      const tx = {
        now: async () => clock.value,
        account: async () => copy(state.account), saveAccount: async (account) => { state.account = copy(account); },
        period: async (id) => copy(state.periods.get(id)), savePeriod: async (period) => { state.periods.set(period.periodId, copy(period)); },
        periods: async () => copy([...state.periods.values()]),
        job: async (id) => copy(state.jobs.get(id)), saveJob: async (job) => { state.jobs.set(job.jobId, copy(job)); },
        jobByWorkKey: async (workKey) => copy([...state.jobs.values()].find((job) => job.workKey === workKey)),
        attempt: async (id) => copy(state.attempts.get(id)), saveAttempt: async (attempt) => { state.attempts.set(attempt.request.attemptId, copy(attempt)); },
        attempts: async (filter) => copy(values(filter)), queued: async () => copy(values().filter((attempt) => attempt.state === "queued")),
        totals: async (filter) => {
          const sum = { liabilityUsdPicos: 0n, estimatedUsdPicos: 0n, observedUsdPicos: 0n, invoicedUsdPicos: 0n,
            requests: 0n, inputTokens: 0n, outputTokens: 0n, billedUnits: 0n, elapsedMs: 0n, attemptCount: 0n, hasOverage: false };
          for (const attempt of values(filter)) {
            const projection = costAttemptTotals(attempt);
            for (const field of Object.keys(sum)) {
              if (field === "hasOverage") sum[field] ||= projection[field];
              else sum[field] += projection[field];
            }
          }
          const periods = [...state.periods.values()].filter((period) => !filter?.periodId || period.periodId === filter.periodId);
          if (!filter?.jobId) sum.hasOverage ||= periods.some((period) => period.openingChargedUsdPicos > period.capUsdPicos);
          return sum;
        },
      };
      try {
        const result = await operation(tx);
        ledgers.set(key, state);
        return result;
      } finally { release(); }
    },
  };
}
