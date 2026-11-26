import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await copyFile(
  path.join(root, 'scripts', 'hostinger-entry.js'),
  path.join(root, 'dist', 'main.js')
);
