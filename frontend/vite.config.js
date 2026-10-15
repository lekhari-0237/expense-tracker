import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');

// backend/server.js reports this from GET /api/health. The legacy Spring Boot jar
// also answers /api/auth/login with the same JSON envelope and it owns port 5000 on
// this machine, so a blind proxy to :5000 can serve dev traffic from the wrong
// backend without any visible error. The probe below catches that.
const NODE_API_SERVICE_ID = 'expense-tracker-node-api';

// Only the PORT key is read out of the env files — never the URI or the secrets.
function portFromEnvFile(relativePath) {
  const file = path.join(projectRoot, relativePath);
  if (!fs.existsSync(file)) return null;
  const match = /^PORT\s*=\s*(\d{2,5})\s*$/m.exec(fs.readFileSync(file, 'utf8'));
  return match ? match[1] : null;
}

function resolveProxyTarget(env) {
  const explicit = env.VITE_DEV_API_URL || env.VITE_API_URL;
  if (explicit) return { target: explicit.replace(/\/+$/, ''), source: 'VITE_DEV_API_URL/VITE_API_URL' };

  const port = env.VITE_DEV_API_PORT || portFromEnvFile('backend/.env') || portFromEnvFile('.env') || '5000';
  return { target: `http://localhost:${port}`, source: 'backend/.env PORT' };
}

function apiIdentityGuard(target) {
  return async () => {
    try {
      const res = await fetch(`${target}/api/health`, { signal: AbortSignal.timeout(3000) });
      const body = await res.json().catch(() => ({}));
      if (body && body.service === NODE_API_SERVICE_ID) {
        console.log(`[vite] /api proxy -> ${target} (Node Expense Tracker API, env=${body.env})`);
        return;
      }
      console.warn(
        `[vite] WARNING: ${target} answered /api/health but is not the Node Expense Tracker API ` +
        `(got: ${JSON.stringify(body && body.service ? body.service : body)}). Relative /api calls ` +
        `are being served by another backend - port 5000 is the legacy Spring Boot service here. ` +
        `Set VITE_DEV_API_URL (or backend/.env PORT) to the Node API port and restart vite.`
      );
    } catch (error) {
      console.warn(
        `[vite] WARNING: nothing answered ${target}/api/health (${error.message}). ` +
        `Start the Node API with "cd backend && npm run dev" and check its port.`
      );
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here, '');
  const { target, source } = resolveProxyTarget(env);
  console.log(`[vite] API proxy target ${target} (from ${source})`);

  return {
    plugins: [
      react(),
      {
        name: 'expense-tracker-api-identity-guard',
        configureServer(server) {
          server.httpServer?.once('listening', apiIdentityGuard(target));
        },
      },
    ],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
