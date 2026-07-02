/**
 * serve-docs.mjs — minimal static server for local preview of the docs/ site.
 * Self-locates docs/ relative to this file, so cwd doesn't matter.
 * Run: node scripts/serve-docs.mjs   →   http://localhost:4321
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, normalize } from 'node:path';

const ROOT = fileURLToPath(new URL('../docs/', import.meta.url));
const PORT = 4321;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain', '.xml': 'application/xml',
};

http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const safe = normalize(p).replace(/^([/\\]|\.\.[/\\])+/, '');
    const data = await readFile(join(ROOT, safe));
    res.writeHead(200, { 'Content-Type': TYPES[extname(safe).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}).listen(PORT, () => console.log('Serving docs/ at http://localhost:' + PORT));
