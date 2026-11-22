#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG_PATH = path.join(ROOT_DIR, 'package.json');
const LOCK_PATH = path.join(ROOT_DIR, 'package-lock.json');

const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

function computeNextVersion(current, target) {
  const match = SEMVER_REGEX.exec(current);
  if (!match) {
    throw new Error(`Versione corrente non valida in package.json: "${current}"`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (target === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (target === 'minor') return `${major}.${minor + 1}.0`;
  if (target === 'major') return `${major + 1}.0.0`;
  if (SEMVER_REGEX.test(target)) return target;
  throw new Error(
    `Argomento non valido "${target}". Usa: patch | minor | major | X.Y.Z`
  );
}

const arg = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
const currentVersion = String(pkg.version || '0.0.0');

if (!arg) {
  console.log(`Versione attuale: v${currentVersion}`);
  console.log('Uso: npm run release -- <patch|minor|major|X.Y.Z>');
  process.exit(0);
}

const nextVersion = computeNextVersion(currentVersion, arg.trim());
pkg.version = nextVersion;
fs.writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

if (fs.existsSync(LOCK_PATH)) {
  const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
  lock.version = nextVersion;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = nextVersion;
  }
  fs.writeFileSync(LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

console.log(`Versione aggiornata: v${currentVersion} -> v${nextVersion}`);
console.log('Prossimi passi consigliati:');
console.log(`  1. Aggiorna CHANGELOG.md per [${nextVersion}]`);
console.log(`  2. git add package.json package-lock.json CHANGELOG.md`);
console.log(`  3. git commit -m "chore(release): v${nextVersion}"`);
console.log(`  4. git tag -a v${nextVersion} -m "Release v${nextVersion}"`);
