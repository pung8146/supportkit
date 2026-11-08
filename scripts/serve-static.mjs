// Serves a folder on its own origin so local pages act as third-party host sites.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const port = Number(process.argv[3] ?? 5174);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };

createServer((request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  const file = join(root, pathname.endsWith('/') ? `${pathname}index.html` : pathname);
  if (!(file + sep).startsWith(root + sep) || !statSync(file, { throwIfNoEntry: false })?.isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
}).listen(port, 'localhost', () => console.log(`${root} on http://localhost:${port}`));
