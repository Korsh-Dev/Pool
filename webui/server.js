const http = require('http');
const fs = require('fs');
const path = require('path');

const UI_PORT = 8080;
const API_HOST = '127.0.0.1';
const API_PORT = 4000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  // Proxy /api/ requests to MiningCore
  if (req.url.startsWith('/api/') || req.url === '/api') {
    const proxyHeaders = Object.assign({}, req.headers);
    proxyHeaders.host = API_HOST + ':' + API_PORT;
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: req.url,
      method: req.method,
      headers: proxyHeaders,
    };
    const proxy = http.request(options, (proxyRes) => {
      const headers = Object.assign({}, proxyRes.headers);
      headers['access-control-allow-origin'] = '*';
      headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
      headers['access-control-allow-headers'] = 'Content-Type';
      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res);
    });
    proxy.on('error', () => {
      res.writeHead(502);
      res.end('API unavailable');
    });
    req.pipe(proxy);
    return;
  }

  // Serve static files
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(UI_PORT, '0.0.0.0', () => {
  console.log(`Pool Dashboard running at http://localhost:${UI_PORT}`);
  console.log(`Proxying /api/ to http://${API_HOST}:${API_PORT}/api/`);
});
