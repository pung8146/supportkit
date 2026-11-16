// Builds the demo shop for deployment: the same static page, pointing at the deployed SupportKit.
// Usage: SUPPORTKIT_URL=https://supportkit.example.com node scripts/build-demo-shop.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'demo-shop');
const target = process.env.SUPPORTKIT_URL?.replace(/\/+$/, '');
if (!target || !/^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(target)) {
  throw new Error('Set SUPPORTKIT_URL to the deployed origin, e.g. https://supportkit.example.com');
}

const source = readFileSync(join(root, 'index.html'), 'utf8');
const local = 'http://localhost:3000/widget/loader.js';
if (source.split(local).length !== 2) throw new Error(`expected exactly one ${local} in index.html`);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'index.html'), source.replace(local, `${target}/widget/loader.js`));
console.log(`demo shop built for ${target}`);
