const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const UI_PORT = process.env.UI_PORT || 8080;
const API_HOST = process.env.API_HOST || '127.0.0.1';
const API_PORT = process.env.API_PORT || 4000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
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
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('API unavailable');
      }
    });

    req.on('aborted', () => {
      proxy.destroy();
    });

    req.pipe(proxy);
    return;
  }

  // Parse URL safely to extract pathname without query parameters
  let pathname;
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    pathname = decodeURIComponent(parsedUrl.pathname);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Normalize path and prevent Path Traversal
  const safeRoot = path.resolve(__dirname);
  const resolvedPath = path.resolve(path.join(safeRoot, pathname));

  if (!resolvedPath.startsWith(safeRoot)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Access Denied');
    return;
  }

  fs.stat(resolvedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
    });

    const stream = fs.createReadStream(resolvedPath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal Server Error');
      }
    });
    stream.pipe(res);
  });
});

server.listen(UI_PORT, '0.0.0.0', () => {
  console.log(`Pool Dashboard running at http://localhost:${UI_PORT}`);
  console.log(`Proxying /api/ to http://${API_HOST}:${API_PORT}/api/`);
});
