"""Deploy the approved worker separately from the public web bundle, then install its bounded cron."""
from datetime import datetime, timezone
import argparse
from pathlib import Path
import runpy
import shlex
import subprocess
import tempfile
import zipfile

from lib.runtime import CommandError, ROOT, main_guard
from lib.deployment import PRIVATE_ROOT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', type=Path, default=PRIVATE_ROOT / '.env.worker.production.local')
    parser.add_argument('--approvals', type=Path, default=PRIVATE_ROOT / '.goal-hint/worker-owner-approvals.json')
    options = parser.parse_args()
    for file in [options.env_file, options.approvals]:
        if not file.is_file():
            raise CommandError('Supply the private worker environment and approved owner register; no worker was deployed.')
    deploy = runpy.run_path(str(ROOT / 'scripts/deploy-cpanel.py'))
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S') + '-' + commit[:7]

    def remote(script, timeout=600):
        result = subprocess.run([deploy['tool']('ssh'), *deploy['SSH_OPTIONS'], '-p', deploy['PORT'],
            f"{deploy['USER']}@{deploy['HOST']}", 'bash -s'], input=script.encode('utf-8'),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
        output = result.stdout.decode('utf-8', 'replace')
        if output:
            print(output, end='', flush=True)
        if result.returncode:
            raise CommandError('Worker deployment failed; private diagnostics remain on the target. No existing web release was changed.')

    remote('umask 077\nmkdir -p "$HOME/goal-hint-worker/incoming"\nchmod 700 "$HOME/goal-hint-worker" "$HOME/goal-hint-worker/incoming"\n')
    with tempfile.TemporaryDirectory(prefix='goalhint-worker-') as temporary:
        archive = Path(temporary) / 'worker.zip'
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
            for file in sorted((ROOT / 'src').rglob('*')):
                if file.is_file():
                    bundle.write(file, 'release/' + file.relative_to(ROOT).as_posix())
            for name in ['package.json', 'package-lock.json', 'scripts/cpanel-worker.sh']:
                if name.endswith('.sh'):
                    bundle.writestr('release/' + name, (ROOT / name).read_bytes().replace(b'\r\n', b'\n'))
                else:
                    bundle.write(ROOT / name, 'release/' + name)
            bundle.write(options.env_file, 'private/.env.production.local')
            bundle.write(options.approvals, 'private/.goal-hint/owner-approvals.json')
        deploy['scp'](archive, 'goal-hint-worker/incoming/worker.zip')
    remote('''set -euo pipefail
umask 077
root="$HOME/goal-hint-worker"
stamp=''' + shlex.quote(stamp) + '''
stage="$root/releases/$stamp"
mkdir -p "$stage" "$root/private" "$root/logs"
unzip -q "$root/incoming/worker.zip" -d "$stage"
rm -f "$root/incoming/worker.zip"
cp -a "$stage/private/." "$root/private/"
chmod -R go-rwx "$root/private" "$stage/private"
export PATH="$HOME/nodevenv/goal-hint/24/bin:$PATH"
cd "$stage/release"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --engine-strict=false > "$root/logs/install-$stamp.log" 2>&1
ln -s "$root/private/.goal-hint" .goal-hint
printf '%s' '{"action":"live-status","payload":{}}' | node --conditions=react-server --env-file="$root/private/.env.production.local" src/server/operations/cli-bridge.mjs > "$root/logs/readiness-$stamp.json"
node --input-type=module - "$root/logs/readiness-$stamp.json" <<'JS'
import {readFileSync} from 'node:fs';
const result=JSON.parse(readFileSync(process.argv[2],'utf8').split('\\x1e').at(-1));
if(!result.ok || !result.value?.ready){ console.log(JSON.stringify({ready:false,gaps:result.value?.gaps ?? ['runtime-unavailable']})); process.exit(1); }
console.log(JSON.stringify({ready:true,account:result.value.account}));
JS
ln -sfn "$stage/release" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
chmod 700 scripts/cpanel-worker.sh
python3 - <<'PY'
from pathlib import Path
import os,subprocess
root=Path.home()/'goal-hint-worker'
old=subprocess.run(['crontab','-l'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True).stdout
lines=[line for line in old.splitlines() if '# goalhint-worker' not in line]
lines.append('*/5 * * * * /bin/bash '+str(root)+'/current/scripts/cpanel-worker.sh >> '+str(root)+'/logs/worker.log 2>&1 # goalhint-worker')
backup=root/'crontab.before'
if not backup.exists(): backup.write_text(old)
subprocess.run(['crontab','-'],input='\\n'.join(lines)+'\\n',universal_newlines=True,check=True)
PY
nohup /bin/bash "$root/current/scripts/cpanel-worker.sh" >> "$root/logs/worker.log" 2>&1 < /dev/null &
printf 'Worker activated: %s; cron every five minutes, maximum 270 seconds per invocation.\\n' "$stamp"
''', timeout=900)


if __name__ == '__main__':
    main_guard(main)
