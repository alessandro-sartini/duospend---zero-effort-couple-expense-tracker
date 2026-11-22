import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { formatServerVersionLabel, getAppVersionInfo } from '../server/version';
import { APP_VERSION, formatAppVersionLabel } from '../src/services/version';

describe('Versionamento applicativo SemVer', () => {
  it('espone una versione SemVer valida coerente con package.json sia lato server che lato client', () => {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      name: string;
      version: string;
    };

    expect(pkg.name).toBe('duospend');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);

    const serverInfo = getAppVersionInfo();
    expect(serverInfo.name).toBe('duospend');
    expect(serverInfo.version).toBe(pkg.version);
    expect(serverInfo.buildSha.length).toBeGreaterThan(0);
    expect(formatServerVersionLabel(serverInfo)).toContain(`v${pkg.version}`);

    expect(APP_VERSION).toBe(pkg.version);
    expect(formatAppVersionLabel()).toContain(`v${pkg.version}`);
  });
});
