// static server for the repo root, no caching
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const T = { html: 'text/html', js: 'text/javascript', css: 'text/css', csv: 'text/csv', md: 'text/plain', xml: 'text/xml' };
http.createServer((q, s) => {
  const p = path.resolve(path.join(ROOT, decodeURIComponent(q.url.split('?')[0])));
  if (!p.startsWith(ROOT)) { s.writeHead(403); return s.end(); }
  fs.readFile(p, (e, b) => {
    if (e) { s.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); return s.end('nf'); }
    s.writeHead(200, { 'Content-Type': (T[path.extname(p).slice(1)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    s.end(b);
  });
}).listen(8765, '127.0.0.1', () => console.log('up'));
