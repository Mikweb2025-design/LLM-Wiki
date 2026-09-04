const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.svg', '.txt']);

module.exports = function serveBuild(buildPath, port, host = '127.0.0.1') {
  const resolvedRoot = path.resolve(buildPath);
  const server = http.createServer((req, res) => {
    // Solo GET/HEAD per uno static server locale
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    // WHATWG URL (niente url.parse deprecato) + fallback su /
    let pathname;
    try {
      const u = new URL(req.url, 'http://127.0.0.1');
      pathname = decodeURIComponent(u.pathname || '/');
    } catch {
      pathname = '/';
    }

    // Normalizza e blocca path traversal (es. /../backend/.env)
    const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    let filePath = path.join(resolvedRoot, safePath === '/' ? 'index.html' : safePath);
    if (!filePath.startsWith(resolvedRoot + path.sep) && filePath !== resolvedRoot) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }
    
    // SPA fallback: directory o file mancante -> index.html (solo se non è un asset con estensione)
    try {
      const st = fs.statSync(filePath);
      if (st.isDirectory()) filePath = path.join(resolvedRoot, 'index.html');
    } catch {
      const ext = path.extname(filePath);
      // Asset con estensione mancante -> 404 vero (evita di servire index.html al posto di un .js)
      if (ext && ext !== '.html') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
      filePath = path.join(resolvedRoot, 'index.html');
    }
    
    // Leggi file
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }

      // ETag debole size-mtime -> 304 su If-None-Match
      let etag = '';
      try {
        const st = fs.statSync(filePath);
        etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
        if (req.headers['if-none-match'] === etag) {
          res.writeHead(304, { ETag: etag, 'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600' });
          res.end();
          return;
        }
      } catch {}
      
      // Determina content type
      const ext = path.extname(filePath).toLowerCase();
      const contentTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.map': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.txt': 'text/plain; charset=utf-8',
      };
      
      const contentType = contentTypes[ext] || 'application/octet-stream';
      // gzip per text asset >1KB se il client lo accetta (main.js 400KB -> ~130KB)
      const acceptGzip = /gzip/i.test(req.headers['accept-encoding'] || '');
      let body = data;
      const headers = {
        'Content-Type': contentType,
        // Server solo su loopback: nega ogni framing esterno
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        ETag: etag,
      };
      if (acceptGzip && COMPRESSIBLE.has(ext) && data.length > 1024) {
        try {
          body = zlib.gzipSync(data);
          headers['Content-Encoding'] = 'gzip';
        } catch {}
      }
      headers['Content-Length'] = body.length;
      // Cache aggressiva per asset fingerprinted (/static/...), mai per index.html
      if (filePath.endsWith('index.html')) {
        headers['Cache-Control'] = 'no-cache';
      } else if (filePath.includes(`${path.sep}static${path.sep}`)) {
        headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      } else {
        headers['Cache-Control'] = 'public, max-age=3600';
      }
      
      res.writeHead(200, headers);
      if (req.method === 'HEAD') res.end();
      else res.end(body);
    });
  });
  
  server.listen(port, host, () => {
    console.log(`Server avviato su http://${host}:${port}`);
  });
  
  return server;
};
