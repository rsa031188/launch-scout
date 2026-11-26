import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
let contents = '';

try {
  contents = await readFile(envPath, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const keyLine = /^MCP_MASTER_KEY\s*=\s*(.*)$/m;
const existingKey = contents.match(keyLine);
if (process.env.MCP_MASTER_KEY) {
  console.log('MCP_MASTER_KEY já está definida no ambiente; nenhuma alteração foi feita.');
} else if (existingKey?.[1].trim()) {
  console.log('MCP_MASTER_KEY já está definida em .env; nenhuma alteração foi feita.');
} else {
  const key = randomBytes(32).toString('base64');
  if (existingKey) {
    contents = contents.replace(keyLine, `MCP_MASTER_KEY=${key}`);
  } else {
    const separator = contents && !contents.endsWith('\n') ? '\n' : '';
    contents += `${separator}MCP_MASTER_KEY=${key}\n`;
  }
  await writeFile(envPath, contents, { encoding: 'utf8', mode: 0o600 });
  console.log('Chave MCP criada em .env. O arquivo está excluído do Git.');
}
