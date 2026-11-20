import express from 'express';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {
  getDeveloperPassword,
  HOST,
  isDeveloperConsoleEnabled,
  PORT,
  PROJECT_ROOT,
  WEBHOOK_SECRET,
} from './config';
import aiRoutes from './routes/ai';
import gmailRoutes from './routes/gmail';
import notificationRoutes from './routes/notifications';
import dataRoutes from './routes/data';
import devRoutes from './routes/dev';
import authRoutes from './routes/auth';
import { requireCoupleAuth } from './middleware/auth';
import { hasPathTraversalOrForbiddenRoute, stripDangerousKeys } from './utils/security';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production'
      ? {
          directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            scriptSrc: ["'self'", 'https://accounts.google.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https:', 'data:'],
            imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
            connectSrc: [
              "'self'",
              'https://accounts.google.com',
              'https://www.googleapis.com',
              'https://*.googleapis.com',
            ],
            frameSrc: ["'self'", 'https://accounts.google.com'],
            formAction: ["'self'", 'https://accounts.google.com'],
            manifestSrc: ["'self'"],
            workerSrc: ["'self'"],
          },
        }
      : false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  })
);
app.use((req, res, next) => {
  if (
    hasPathTraversalOrForbiddenRoute(req.originalUrl) ||
    hasPathTraversalOrForbiddenRoute(req.path)
  ) {
    return res.status(400).json({ error: 'Percorso richiesta non consentito.' });
  }
  return next();
});
app.use('/api', (req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    console.info(`[api] ${req.method} ${req.originalUrl.split('?')[0]} -> ${res.statusCode} (${Date.now() - startedAt}ms)`);
  });
  res.on('close', () => {
    if (!res.writableFinished) {
      console.warn(`[api] ${req.method} ${req.originalUrl.split('?')[0]} -> CLIENT_ABORTED (${Date.now() - startedAt}ms)`);
    }
  });
  next();
});
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: Math.round(process.uptime()) });
});
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use(express.json({ limit: '15mb', strict: true }));
app.use((req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = stripDangerousKeys(req.body);
  }
  next();
});
app.use('/api/auth/google-session', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use(authRoutes);
app.use('/api/gemini', rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api/gmail/sync', rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api/notifications', rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api/data', rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use(aiRoutes);
app.use(gmailRoutes);
app.use(notificationRoutes);
app.use(dataRoutes);
app.use('/api/dev', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use(
  '/api/auth/dev-login',
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false })
);
app.use(devRoutes);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint API non trovato.' });
});

export async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(PROJECT_ROOT, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (
    process.env.NODE_ENV === 'production' &&
    WEBHOOK_SECRET &&
    (WEBHOOK_SECRET.length < 24 || /replace|changeme|example/i.test(WEBHOOK_SECRET))
  ) {
    console.warn(
      'ATTENZIONE: DUOSPEND_WEBHOOK_SECRET è debole o segnaposto. Generane uno casuale di almeno 24 caratteri.'
    );
  }

  if (
    process.env.NODE_ENV === 'production' &&
    isDeveloperConsoleEnabled() &&
    getDeveloperPassword().length < 10
  ) {
    console.warn(
      'ATTENZIONE: DUOSPEND_DEV_PASSWORD è troppo corta per la produzione (consigliati almeno 12 caratteri).'
    );
  }

  const listenHost = process.env.NODE_ENV === 'production' ? HOST : '127.0.0.1';
  app.listen(PORT, listenHost, () => {
    console.log(`DuoSpend server running at http://${listenHost}:${PORT}`);
  });
}
