import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

function resolveFrontendBuildMetadata() {
  const pkgPath = path.resolve(import.meta.dirname, 'package.json');
  let version = '0.0.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
    if (typeof pkg.version === 'string' && pkg.version.trim()) {
      version = pkg.version.trim();
    }
  } catch {
    // fallback default
  }

  let buildSha = (process.env.APP_BUILD_SHA || process.env.GIT_COMMIT_SHA || '').trim();
  if (!buildSha || buildSha === 'unknown') {
    try {
      buildSha = execSync('git rev-parse --short HEAD', {
        cwd: import.meta.dirname,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 1500,
      })
        .toString('utf8')
        .trim();
    } catch {
      buildSha = 'local';
    }
  }

  const buildTime = (process.env.APP_BUILD_TIME || '').trim() || new Date().toISOString();
  return { version, buildSha: buildSha.slice(0, 12), buildTime };
}

export default defineConfig(() => {
  const buildMeta = resolveFrontendBuildMetadata();
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(buildMeta.version),
      __APP_BUILD_SHA__: JSON.stringify(buildMeta.buildSha),
      __APP_BUILD_TIME__: JSON.stringify(buildMeta.buildTime),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalized = id.replace(/\\/g, '/');
            if (
              normalized.includes('/node_modules/react/') ||
              normalized.includes('/node_modules/react-dom/') ||
              normalized.includes('/node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }
            if (normalized.includes('/node_modules/lucide-react/')) {
              return 'vendor-icons';
            }
            return undefined;
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
