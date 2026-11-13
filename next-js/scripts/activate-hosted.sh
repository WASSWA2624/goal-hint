#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# != 6 ]]; then
  echo 'Usage: activate-hosted.sh staging|production RELEASE ACCOUNT NODE MIGRATION_CNF DATABASE' >&2
  exit 1
fi

environment=$1
release=$(realpath -- "$2")
account=$3
node=$4
migration_config=$(realpath -- "$5")
database=$6
case "$environment:$account:$database" in
  staging:ghstage:ghstage_*) environment_file=.env.test ;;
  production:ghprod:ghprod_prod) environment_file=.env.production ;;
  *) echo 'The environment, account and database do not match.' >&2; exit 1 ;;
esac

home=$(getent passwd "$account" | cut -d: -f6)
case "$release" in "$home/goal-hint-releases/"*) ;; *) exit 1 ;; esac
private="$home/goal-hint-private"
active="$home/goal-hint"
[[ -L "$active" && -f "$release/app.js" && -d "$release/standalone" ]]
[[ "$release" != "$(realpath -- "$active")" ]]
env_path="$private/$environment_file"
[[ -f "$env_path" && -f "$private/.goal-hint/owner-approvals.json" ]]

exec 9>"$private/.release.lock"
flock -x 9
"$node" - "$env_path" "$environment" "$database" <<'JS'
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const [, , path, environment, database] = process.argv;
const settings = parseEnv(readFileSync(path, 'utf8'));
const url = new URL(settings.DATABASE_URL);
if (settings.GOAL_HINT_DEPLOYMENT_ENVIRONMENT !== environment || url.protocol !== 'mysql:' ||
    url.hostname !== '127.0.0.1' || (url.port && url.port !== '3306') ||
    decodeURIComponent(url.pathname.slice(1)) !== database || settings.GOAL_HINT_DATABASE_ENABLED !== 'true') {
  throw new Error('The application environment does not match the release database.');
}
JS

migrate=(python3 "$release/scripts/deploy-mariadb.py" --environment "$environment"
  --defaults-file "$migration_config" --database "$database" --prisma-dir "$release/prisma")
if "${migrate[@]}" --status; then
  echo 'The target database is current.'
else
  status=$?
  [[ "$status" == 2 ]] || exit "$status"
  # The database must be backed up and any required writer pause handled before activation.
  : "${GOAL_HINT_MIGRATION_BACKUP:?Set GOAL_HINT_MIGRATION_BACKUP to the verified backup checksum file.}"
  sha256sum --check --status "$GOAL_HINT_MIGRATION_BACKUP"
  "${migrate[@]}"
fi
"${migrate[@]}" --status

install -m 600 -o "$account" -g "$account" "$env_path" "$release/standalone/$environment_file"
install -d -m 700 -o "$account" -g "$account" "$release/standalone/.goal-hint"
install -m 600 -o "$account" -g "$account" "$private/.goal-hint/owner-approvals.json" "$release/standalone/.goal-hint/owner-approvals.json"
install -d -m 755 -o "$account" -g "$account" "$release/tmp"
marker=$(mktemp "$release/.goal-hint-migrations.XXXXXX")
link="$active.next.$$"
trap 'rm -f -- "$marker" "$link"' EXIT
"$node" - "$release/BUILD_INFO.json" "$environment" "$database" >"$marker" <<'JS'
const { readFileSync } = require('node:fs');
const [, , path, environment, database] = process.argv;
const { migrations } = JSON.parse(readFileSync(path, 'utf8'));
if (!/^[0-9a-f]{64}$/.test(migrations)) throw new Error('The release has no migration manifest.');
process.stdout.write(JSON.stringify({ environment, database, migrations }) + '\n');
JS
chmod 644 "$marker"
mv -T "$marker" "$release/.goal-hint-migrations.json"
ln -s -- "$release" "$link"
chown -h "$account:$account" "$link"
runuser -u "$account" -- touch "$release/tmp/restart.txt"
mv -T "$link" "$active"
printf 'Activated %s on %s with a current database.\n' "${release##*/}" "$environment"
