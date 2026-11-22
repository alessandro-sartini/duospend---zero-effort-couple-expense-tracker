import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT } from './config';

export interface AppVersionInfo {
  name: string;
  version: string;
  buildSha: string;
  buildTime: string;
}

function readPackageMetadata(): { name: string; version: string } {
  try {
    const pkgPath = path.join(PROJECT_ROOT, 'package.json');
    const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      name?: unknown;
      version?: unknown;
    };
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'duospend';
    const version =
      typeof raw.version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(raw.version.trim())
        ? raw.version.trim()
        : '0.0.0';
    return { name, version };
  } catch {
    return { name: 'duospend', version: '0.0.0' };
  }
}

function resolveBuildSha(): string {
  const envSha = (process.env.APP_BUILD_SHA || process.env.GIT_COMMIT_SHA || '').trim();
  if (envSha && envSha !== 'unknown') {
    return envSha.slice(0, 12);
  }
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500,
    })
      .toString('utf8')
      .trim()
      .slice(0, 12);
  } catch {
    return 'local';
  }
}

let cachedVersionInfo: AppVersionInfo | null = null;

export function getAppVersionInfo(): AppVersionInfo {
  if (cachedVersionInfo) return cachedVersionInfo;
  const { name, version } = readPackageMetadata();
  const buildSha = resolveBuildSha();
  const buildTime = (process.env.APP_BUILD_TIME || '').trim() || new Date().toISOString();
  cachedVersionInfo = { name, version, buildSha, buildTime };
  return cachedVersionInfo;
}

export function formatServerVersionLabel(info: AppVersionInfo = getAppVersionInfo()): string {
  return info.buildSha && info.buildSha !== 'local'
    ? `v${info.version} (${info.buildSha})`
    : `v${info.version}`;
}
