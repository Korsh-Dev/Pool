/**
 * KORSH MINING POOL — HYBRID LOCAL PREVIEW & PRODUCTION PROXY SERVER
 * Zero-dependency Node.js HTTP server.
 * 
 * Features:
 * 1. Serves static files (HTML, CSS, JS, Images, Icons) with path traversal protection.
 * 2. Smart Reverse Proxy:
 *    - In production (Systemd/Docker): Proxies /api/ to local Miningcore daemon (API_HOST:API_PORT).
 *    - In local dev / standalone: Proxies /api/ to https://pool.korsh.org/api/ with zero config.
 * 3. Configurable via environment variables (UI_PORT, PORT, API_HOST, API_PORT).
 * 4. Auto-opens the default browser on Windows when run interactively.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { exec } = require('child_process');

const UI_PORT = parseInt(process.env.UI_PORT || process.env.PORT, 10) || 3050;
const API_HOST = process.env.API_HOST || 'pool.korsh.org';
const API_PORT = parseInt(process.env.API_PORT, 10) || (API_HOST === 'pool.korsh.org' ? 443 : 4000);
const IS_HTTPS_BACKEND = API_PORT === 443 || API_HOST.includes('pool.korsh.org');
const PUBLIC_DIR = path.resolve(__dirname);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  let parsedUrl;
  let pathname;
  try {
    parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    pathname = decodeURIComponent(parsedUrl.pathname);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  // 1. REVERSE PROXY FOR API CALLS (/api/*)
  if (pathname.startsWith('/api/') || pathname === '/api') {
    const remotePath = pathname + parsedUrl.search;
    const forwardHeaders = { ...req.headers };
    delete forwardHeaders.host;
    forwardHeaders.host = API_HOST;
    forwardHeaders['user-agent'] = 'KorshPoolServer/2.0';
    forwardHeaders['accept-encoding'] = 'identity';

    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: remotePath,
      method: req.method,
      headers: forwardHeaders
    };

    const client = IS_HTTPS_BACKEND ? https : http;
    const proxyReq = client.request(options, (proxyRes) => {
      const headers = { ...proxyRes.headers };
      headers['access-control-allow-origin'] = '*';
      headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
      headers['access-control-allow-headers'] = 'Content-Type, Authorization';

      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
      console.error(`[API Proxy Error] ${remotePath}:`, err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json', 'access-control-allow-origin': '*' });
        res.end(JSON.stringify({ error: 'Failed to proxy request to miningcore backend', details: err.message }));
      }
    });

    req.pipe(proxyReq, { end: true });
    return;
  }

  // 2. STATIC FILE SERVER
  const safeRoot = PUBLIC_DIR;
  let targetPath = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.resolve(path.join(safeRoot, targetPath));

  // Security: Prevent Directory Traversal (CWE-22)
  if (!filePath.startsWith(safeRoot)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden: Access Denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const fallbackIndex = path.join(filePath, 'index.html');
      if (fs.existsSync(fallbackIndex)) {
        filePath = fallbackIndex;
      } else {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 Not Found</h1><p>The requested file ' + pathname + ' was not found.</p>');
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN'
    });

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Internal Server Error');
      }
    });
    stream.pipe(res);
  });
});

function startServer(portToTry) {
  server.listen(portToTry, '0.0.0.0', () => {
    const localUrl = `http://localhost:${portToTry}`;
    console.log('=======================================================');
    console.log('       KORSH [KSH] MINING POOL — WEB SERVER            ');
    console.log('=======================================================');
    console.log(`[*] Dashboard Web activo en:   ${localUrl}`);
    console.log(`[*] Backend API configurado a: ${IS_HTTPS_BACKEND ? 'https' : 'http'}://${API_HOST}:${API_PORT}/api/`);
    console.log('-------------------------------------------------------');

    // Auto-open browser on Windows if not running headless / in production
    const isWindows = process.platform === 'win32';
    const isAutoOpen = !process.env.NO_OPEN && process.env.NODE_ENV !== 'production';
    if (isWindows && isAutoOpen && portToTry === UI_PORT) {
      console.log('[i] Abriendo navegador local automaticamente...');
      exec(`start "" "${localUrl}"`, () => {});
    }

    console.log('[i] Presiona Ctrl + C para detener el servidor.');
    console.log('=======================================================');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[!] Puerto ${portToTry} ocupado, probando puerto ${portToTry + 1}...`);
      startServer(portToTry + 1);
    } else {
      console.error('[ERROR]', err);
    }
  });
}

startServer(UI_PORT);
