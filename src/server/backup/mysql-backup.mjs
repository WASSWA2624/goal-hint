import 'server-only';

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { failBackup, sha256 } from './backup-contract.mjs';
import { isOwnedMysql } from './isolated-mysql.mjs';
import { mysqlChild } from './mysql-tools.mjs';
export { mysqlChild } from './mysql-tools.mjs';

const identifier = (value) => { if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/u.test(value)) failBackup('invalid-identifier'); return `\`${value}\``; };
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

export async function repositoryMigrations(root = 'prisma/migrations') {
  const names = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  return Promise.all(names.map(async (name) => ({ name, checksum: sha256(await readFile(path.join(root, name, 'migration.sql'))) })));
}
export async function repositoryCompatibility() {
  return { schemaHash: sha256(await readFile('prisma/schema.prisma')), lockfileHash: sha256(await readFile('package-lock.json')) };
}

/** No URL/password argument. A hosted adapter must supply an approved private option file. */
export function createMysqlBackupSource({ binDirectory, defaultsFile, databaseName, expectedUuid, verifyQuiescence, ownedInstance }) {
  identifier(databaseName);
  if (ownedInstance && !isOwnedMysql(ownedInstance)) failBackup('unsafe-target');
  const connection = ownedInstance ? [...ownedInstance.connection] : [`--defaults-file=${path.resolve(defaultsFile)}`, '--no-login-paths'];
  const binary = (name) => path.join(binDirectory, process.platform === 'win32' ? `${name}.exe` : name);
  const clientArgs = [...connection, `--database=${databaseName}`, '--default-character-set=utf8mb4', '--batch', '--raw', '--skip-column-names',
    '--binary-mode', '--local-infile=0', '--skip-reconnect'];
  async function query(sql) {
    try {
      if (ownedInstance) await ownedInstance.assertOwnership();
      const tool = mysqlChild(binary('mysql'), clientArgs), chunks = []; let bytes = 0, oversized = false;
      tool.child.stdout.on('data', (chunk) => { bytes += chunk.length;
        if (bytes > 64 * 1024 * 1024) { oversized = true; tool.child.kill(); } else chunks.push(chunk); });
      tool.child.stdin.on('error', () => {});
      tool.child.stdin.end(`SET time_zone='+00:00'; ${sql};\n`);
      await tool.done;
      if (oversized) failBackup('inventory-too-large');
      const stdout = Buffer.concat(chunks).toString('utf8');
      return stdout.trim() ? stdout.trim().split(/\r?\n/u) : [];
    } catch { failBackup('mysql-unavailable'); }
  }
  async function identity() {
    const [row] = await query("SELECT JSON_OBJECT('uuid',@@server_uuid,'version',@@version,'database',DATABASE(),'logBin',@@log_bin,'format',@@binlog_format)");
    const result = JSON.parse(row ?? 'null');
    if (!result || !/^8\.4\./u.test(result.version) || result.database !== databaseName || expectedUuid && result.uuid !== expectedUuid) failBackup('source-mismatch');
    return result;
  }
  async function assertQuiescence() {
    if (await verifyQuiescence?.() !== true) failBackup('writes-not-fenced');
    await identity();
  }
  async function inventory() {
    const metadataSql = [
      "SELECT JSON_OBJECT('kind','table','table',TABLE_NAME,'engine',ENGINE,'collation',TABLE_COLLATION,'type',TABLE_TYPE) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME",
      "SELECT JSON_OBJECT('kind','column','table',TABLE_NAME,'name',COLUMN_NAME,'ordinal',ORDINAL_POSITION,'type',COLUMN_TYPE,'nullable',IS_NULLABLE,'default',COLUMN_DEFAULT,'extra',EXTRA,'expression',GENERATION_EXPRESSION,'charset',CHARACTER_SET_NAME,'collation',COLLATION_NAME) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION",
      "SELECT JSON_OBJECT('kind','index','table',TABLE_NAME,'name',INDEX_NAME,'sequence',SEQ_IN_INDEX,'column',COLUMN_NAME,'expression',EXPRESSION,'nonUnique',NON_UNIQUE,'prefix',SUB_PART,'type',INDEX_TYPE,'visible',IS_VISIBLE,'collation',COLLATION) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX",
      "SELECT JSON_OBJECT('kind','check','table',t.TABLE_NAME,'name',t.CONSTRAINT_NAME,'clause',c.CHECK_CLAUSE,'enforced',t.ENFORCED) FROM information_schema.TABLE_CONSTRAINTS t JOIN information_schema.CHECK_CONSTRAINTS c ON c.CONSTRAINT_SCHEMA=t.CONSTRAINT_SCHEMA AND c.CONSTRAINT_NAME=t.CONSTRAINT_NAME WHERE t.CONSTRAINT_SCHEMA=DATABASE() ORDER BY t.TABLE_NAME,t.CONSTRAINT_NAME",
      "SELECT JSON_OBJECT('kind','fk','table',k.TABLE_NAME,'name',k.CONSTRAINT_NAME,'column',k.COLUMN_NAME,'parent',k.REFERENCED_TABLE_NAME,'parentColumn',k.REFERENCED_COLUMN_NAME,'parentSchema',k.REFERENCED_TABLE_SCHEMA,'update',r.UPDATE_RULE,'delete',r.DELETE_RULE) FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION",
      "SELECT JSON_OBJECT('kind','trigger','name',TRIGGER_NAME,'table',EVENT_OBJECT_TABLE,'event',EVENT_MANIPULATION,'timing',ACTION_TIMING,'body',ACTION_STATEMENT,'definer',DEFINER,'mode',SQL_MODE) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() ORDER BY TRIGGER_NAME",
      "SELECT JSON_OBJECT('kind','program') FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE() UNION ALL SELECT JSON_OBJECT('kind','program') FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE()",
      "SELECT JSON_OBJECT('kind','migration','name',migration_name,'checksum',checksum,'complete',finished_at IS NOT NULL AND rolled_back_at IS NULL) FROM _prisma_migrations ORDER BY migration_name",
    ];
    const metadata = (await query(metadataSql.join(';'))).map((row) => JSON.parse(row));
    const tables = metadata.filter((v) => v.kind === 'table').map((v) => v.table);
    if (!tables.includes('_prisma_migrations')) failBackup('incompatible-schema');
    if (metadata.some((v) => v.kind === 'table' && (v.engine !== 'InnoDB' || v.type !== 'BASE TABLE'))) failBackup('unsupported-storage');
    if (metadata.some((v) => v.kind === 'program')) failBackup('unsupported-stored-program');
    const migrations = metadata.filter((v) => v.kind === 'migration');
    if (migrations.some((v) => !v.complete)) failBackup('incompatible-schema');
    const digests = new Map(tables.map((table) => [table, { digest: createHash('sha256'), count: 0 }]));
    const hashSql = tables.map((table) => {
      const columns = metadata.filter((v) => v.kind === 'column' && v.table === table).map((v) => identifier(v.name));
      return `SELECT JSON_OBJECT('table',${literal(table)},'hash',SHA2(CAST(JSON_ARRAY(${columns.join(',')}) AS CHAR),256)) AS rowHash FROM ${identifier(table)} ORDER BY rowHash`;
    });
    for (const value of await query(hashSql.join(';'))) {
      const row = JSON.parse(value), state = digests.get(row.table);
      if (!state || !/^[a-f0-9]{64}$/u.test(row.hash)) failBackup('invalid-inventory'); state.digest.update(row.hash); state.count++;
    }
    const tableInventory = tables.map((table) => ({ table, count: digests.get(table).count, hash: digests.get(table).digest.digest('hex'),
      schemaHash: sha256(JSON.stringify(metadata.filter((v) => v.table === table && ['table','column','index','check'].includes(v.kind)))) }));
    const keys = metadata.filter((v) => v.kind === 'fk');
    if (keys.some((v) => v.parentSchema !== databaseName)) failBackup('unsupported-cross-schema-key');
    const groups = new Map();
    for (const key of keys) { const name = `${key.table}:${key.name}`; if (!groups.has(name)) groups.set(name, []); groups.get(name).push(key); }
    const foreignKeySql = [];
    for (const group of groups.values()) {
      const first = group[0], join = group.map((k) => `c.${identifier(k.column)}=p.${identifier(k.parentColumn)}`).join(' AND ');
      const nonnull = group.map((k) => `c.${identifier(k.column)} IS NOT NULL`).join(' AND ');
      foreignKeySql.push(`SELECT COUNT(*) FROM ${identifier(first.table)} c LEFT JOIN ${identifier(first.parent)} p ON ${join}
        WHERE ${nonnull} AND p.${identifier(first.parentColumn)} IS NULL`);
    }
    if (foreignKeySql.length && (await query(foreignKeySql.join(';'))).some((count) => count !== '0')) failBackup('foreign-key-violation');
    const triggers = metadata.filter((v) => v.kind === 'trigger');
    return { tables: tableInventory, migrations: migrations.map(({ name, checksum }) => ({ name, checksum })), foreignKeys: sha256(JSON.stringify(keys)), triggers: sha256(JSON.stringify(triggers)) };
  }
  return Object.freeze({ databaseName, ownedInstance, binary, connection, clientArgs, query, identity, assertQuiescence, inventory,
    dump() { return mysqlChild(binary('mysqldump'), [...connection, '--single-transaction', '--source-data=2', '--set-gtid-purged=OFF',
      '--no-tablespaces', '--hex-blob', '--triggers', '--skip-add-drop-table', '--skip-add-locks', '--skip-disable-keys', '--column-statistics=0', databaseName]); } });
}
export async function ownedMysqlSource(instance, verifyQuiescence = async () => true) {
  if (!isOwnedMysql(instance)) failBackup('unsafe-target');
  await instance.assertOwnership();
  const [uuid] = (await instance.executeAdmin('SELECT @@server_uuid')).stdout.trim().split(/\s/u);
  return createMysqlBackupSource({ binDirectory: path.dirname(instance.binary), databaseName: instance.databaseName, expectedUuid: uuid, verifyQuiescence, ownedInstance: instance });
}
