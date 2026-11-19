// Plugin Vite: (1) menyisipkan HTML landing page statis dari src/landing/content.mjs,
// (2) membuat robots.txt dan sitemap.xml, (3) fallback SPA untuk /app/* saat dev dan preview.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const contentFile = path.join(root, 'src/landing/content.mjs');
const renderFile = path.join(root, 'src/landing/render.mjs');

async function load(file, bust) {
  return import(`${pathToFileURL(file).href}${bust ? `?t=${Date.now()}` : ''}`);
}

export function siteUrlOf(content) {
  return (process.env.VITE_SITE_URL || content.siteUrl || '').replace(/\/$/, '');
}

// Permintaan ke /app/... (bukan berkas, bukan /api) dijawab dengan index.html aplikasi.
function spaFallback(req, _res, next) {
  const url = req.url ?? '';
  const pathname = url.split('?')[0];
  if (pathname === '/app') req.url = '/app/';
  else if (pathname.startsWith('/app/') && !path.extname(pathname)) req.url = `/app/index.html${url.includes('?') ? `?${url.split('?')[1]}` : ''}`;
  next();
}

export default function landingPlugin() {
  let isDev = false;
  return {
    name: 'tomodachiqua-landing',
    configResolved(config) {
      isDev = config.command === 'serve';
    },
    configureServer(server) {
      server.middlewares.use(spaFallback);
      server.watcher.add([contentFile, renderFile]);
    },
    configurePreviewServer(server) {
      server.middlewares.use(spaFallback);
    },
    handleHotUpdate({ file, server }) {
      if (file === contentFile || file === renderFile) server.ws.send({ type: 'full-reload' });
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        if (!html.includes('<!--LANDING_BODY-->')) return html;
        const { content } = await load(contentFile, isDev);
        const { renderHead, renderBody } = await load(renderFile, isDev);
        return html.replace('<!--LANDING_HEAD-->', renderHead(content, siteUrlOf(content))).replace('<!--LANDING_BODY-->', renderBody(content));
      },
    },
    async generateBundle() {
      const { content } = await load(contentFile, false);
      const site = siteUrlOf(content);
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\nDisallow: /app/\n${site ? `\nSitemap: ${site}/sitemap.xml\n` : ''}`,
      });
      if (site) {
        const today = new Date().toISOString().slice(0, 10);
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${site}/</loc>\n    <lastmod>${today}</lastmod>\n  </url>\n</urlset>\n`,
        });
      }
    },
  };
}
