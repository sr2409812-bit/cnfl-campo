const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '127.0.0.1';
const DIR = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function resolveAssetPath(requestUrl) {
  let pathname;
  try { pathname = decodeURIComponent(requestUrl.split(/[?#]/, 1)[0]); }
  catch (_) { return null; }
  if (pathname === '/') pathname = '/index.html';
  if (!pathname.startsWith('/')) return null;
  const name = pathname.slice(1);
  // La app estática solo sirve archivos públicos de la raíz del proyecto.
  if (!name || name.startsWith('.') || name.includes('/') || name.includes('\\') || !Object.hasOwn(MIME, path.extname(name))) return null;
  return path.join(DIR, name);
}

const server = http.createServer((req, res) => {
  const filePath = resolveAssetPath(req.url);
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext]
    });
    res.end(data);
  });
});

if (require.main === module) server.listen(PORT, HOST, () => {
  console.log(`CNFL Server running on http://${HOST}:${PORT}`);
});

module.exports = { server, resolveAssetPath };
