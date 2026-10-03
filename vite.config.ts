import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';

/**
 * Lets `npm run dev` serve the Vercel functions in /api without the Vercel CLI.
 * Each file exports Web-standard handlers (`export function GET(req: Request)`),
 * exactly what Vercel runs in production.
 */
function vercelApi(): Plugin {
  const resolveRoute = (path: string): string | null => {
    const base = resolve(__dirname, '.' + path.replace(/\/$/, ''));
    for (const file of [`${base}.ts`, `${base}/index.ts`]) {
      if (existsSync(file) && !file.includes('/_')) return file;
    }
    return null;
  };

  const handle = async (server: ViteDevServer, req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const file = resolveRoute(url.pathname);
    if (!file) return false;
    const mod = await server.ssrLoadModule(file);
    const handler = mod[req.method ?? 'GET'];
    if (typeof handler !== 'function') {
      res.statusCode = 405;
      res.end();
      return true;
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const response: Response = await handler(new Request(url, { method: req.method, headers }));
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await response.arrayBuffer()));
    return true;
  };

  return {
    name: 'vercel-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        try {
          if (!(await handle(server, req, res))) next();
        } catch (err) {
          server.ssrFixStacktrace(err as Error);
          console.error(err);
          res.statusCode = 500;
          res.end('api error');
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Expose .env to the dev API handlers (server-side only; nothing here reaches the bundle).
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [vercelApi()],
    build: { target: 'es2022', cssCodeSplit: false, assetsInlineLimit: 2048 },
  };
});
