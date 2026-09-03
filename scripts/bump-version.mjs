import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = resolve(rootDir, 'package.json');

function parseVersionArg(argv) {
  const entry = argv.find((arg) => arg.startsWith('--version='));
  return entry ? entry.slice('--version='.length) : null;
}

function nextPatch(version) {
  const parts = version.split('.');
  const major = Number(parts[0]) || 0;
  const minor = Number(parts[1]) || 0;
  const patch = (Number(parts[2]) || 0) + 1;
  return `${major}.${minor}.${patch}`;
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const current = pkg.version;
const given = parseVersionArg(process.argv.slice(2));

let next;
if (given) {
  if (!/^\d+\.\d+\.\d+$/.test(given)) {
    console.error(`[bump-version] 无效版本号：${given}（应为 x.y.z 格式）`);
    process.exit(1);
  }
  next = given;
} else {
  next = nextPatch(current);
}

pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`[bump-version] ${current} -> ${next}`);
