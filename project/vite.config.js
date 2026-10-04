import { defineConfig, loadEnv } from 'vite';
import auditHandler from '../api/audit.js';

export default defineConfig(({ mode }) => {
  // Load environment variables (.env, .env.local) during development
  const env = loadEnv(mode, process.cwd(), '');
  if (env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
  }

  return {
    plugins: [
      {
        name: 'local-audit-api-middleware',
        configureServer(server) {
          server.middlewares.use('/api/audit', (req, res, next) => {
            if (req.method === 'POST') {
              let body = '';
              req.on('data', (chunk) => {
                body += chunk;
              });
              req.on('end', async () => {
                try {
                  req.body = body ? JSON.parse(body) : {};
                } catch {
                  req.body = {};
                }
                try {
                  await auditHandler(req, res);
                } catch (err) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
                }
              });
              return;
            }
            next();
          });
        },
      },
    ],
  };
});
