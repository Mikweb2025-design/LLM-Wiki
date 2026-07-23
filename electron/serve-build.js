const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

module.exports = function serveBuild(buildPath, port) {
  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);
    let pathname = parsedUrl.pathname;
    
    // Rimuovi query string
    pathname = pathname.split('?')[0];
    
    // Percorso file
    let filePath = path.join(buildPath, pathname === '/' ? 'index.html' : pathname);
    
    // Se il file non esiste e non ha estensione, prova index.html (SPA fallback)
    if (!fs.existsSync(filePath)) {
      filePath = path.join(buildPath, 'index.html');
    }
    
    // Leggi file
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
      
      // Determina content type
      const ext = path.extname(filePath);
      const contentTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.eot': 'application/vnd.ms-fontobject',
      };
      
      const contentType = contentTypes[ext] || 'application/octet-stream';
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
  
  server.listen(port, () => {
    console.log(`Server avviato su http://localhost:${port}`);
  });
  
  return server;
};
