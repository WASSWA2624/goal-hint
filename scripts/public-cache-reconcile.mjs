import { disconnectDatabase, getDatabase } from '../src/server/database/client.ts';
import { createMysqlPublicCacheStore } from '../src/server/cache/mysql-public-cache.ts';

// One bounded private maintenance pass. Hosting may schedule repeats; generation
// fencing already works when this command is delayed or absent.
try {
  if (process.argv.length > 3 || process.argv[2] !== undefined && !/^[1-9]\d{0,3}$/u.test(process.argv[2])) throw new Error();
  const result = await createMysqlPublicCacheStore(getDatabase()).reconcile(Number(process.argv[2] ?? 100));
  console.log(JSON.stringify(result));
} catch {
  console.error('Cache maintenance unavailable; check approved database access and the 031 migration. Private diagnostics are withheld.');
  process.exitCode = 1;
} finally { await disconnectDatabase(); }
