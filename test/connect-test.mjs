// Test end-to-end de session-search con sesiones zstd sintéticas.
import path from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { zstdCompressSync } from 'node:zlib';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const packageDir = path.resolve(import.meta.dirname, '..');
const tmpDir = path.join(packageDir, 'test', 'tmp');
rmSync(tmpDir, { recursive: true, force: true });
const home = path.join(tmpDir, 'dsh-home');
const sessionsRoot = path.join(home, 'sessions');
const projRoot = path.join(home, 'storages', 'session_projcache', 'sessions');
mkdirSync(projRoot, { recursive: true });

function makeSession(workspace, sessionId, texts) {
  const dir = path.join(sessionsRoot, workspace, sessionId);
  mkdirSync(dir, { recursive: true });
  const lines = texts.map((text, index) => JSON.stringify({ type: index % 2 === 0 ? 'user' : 'assistant', text }));
  writeFileSync(path.join(dir, 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(lines.join('\n') + '\n', 'utf8')));
  return path.join(dir, 'session.v4.jsonl.zstd');
}

makeSession('--C-Users-desco-Projects--', 'aaaa1111-2222-3333-4444-555555555555', ['Necesito arreglar el bot de WENDIGO tickets', 'Revisé el ticket y falta el token de Discord']);
makeSession('--C-Users-desco-Projects--', 'bbbb1111-2222-3333-4444-555555555555', ['Hablemos de las facturas de noviembre', 'El total del IVA quedó raro']);
writeFileSync(path.join(projRoot, 'aaaa1111-2222-3333-4444-555555555555.json'), JSON.stringify({ version: 7, record: { identity: { cwd: 'C:\\proj', createdAt: 1793004078286 }, rows: { title: { val: 'Bot WENDIGO' } } } }), 'utf8');
writeFileSync(path.join(projRoot, 'bbbb1111-2222-3333-4444-555555555555.json'), JSON.stringify({ version: 7, record: { identity: { cwd: 'C:\\proj' }, rows: { title: { val: 'Facturas' } } } }), 'utf8');

function makeClient(extraEnv = {}) {
  const entry = process.env.SESSIONS_SERVER ? path.resolve(process.env.SESSIONS_SERVER) : path.join(packageDir, 'server.mjs');
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', PATH: process.env.PATH, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME || process.env.USERPROFILE, TEMP: process.env.TEMP, TMP: process.env.TMP, DSH_HOME: home, ...extraEnv }, stderr: 'pipe' });
  transport.stderr?.on('data', (c) => process.stderr.write(`[server] ${c}`));
  const client = new Client({ name: 'sessions-test', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'auto' } });
  return client.connect(transport).then(() => ({ client, transport }));
}
const textOf = (r) => (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

const { client, transport } = await makeClient();
console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '));
console.log('--- status ---'); console.log(textOf(await client.callTool({ name: 'status', arguments: {} })));
const recent = await client.callTool({ name: 'recent', arguments: {} });
console.log('--- recent ---'); console.log(textOf(recent));
console.log('títulos presentes:', textOf(recent).includes('Bot WENDIGO'), textOf(recent).includes('Facturas'));
const search = await client.callTool({ name: 'search', arguments: { query: 'WENDIGO' } });
console.log('--- search WENDIGO ---'); console.log(textOf(search).slice(0, 600));
console.log('encuentra sesión:', textOf(search).includes('Bot WENDIGO'), '| fragmento:', textOf(search).includes('tickets'));
const search2 = await client.callTool({ name: 'search', arguments: { query: 'IVA' } });
console.log('search IVA:', textOf(search2).includes('Facturas'));
const none = await client.callTool({ name: 'search', arguments: { query: 'inexistenteXYZ' } });
console.log('sin resultados:', !none.isError && textOf(none).includes('Sin resultados'));
const read = await client.callTool({ name: 'read', arguments: { sessionId: 'aaaa1111', limit: 10 } });
console.log('--- read ---'); console.log(textOf(read).slice(0, 500));
console.log('read trae texto:', textOf(read).includes('token de Discord'));
await client.close(); try { await transport.close?.(); } catch {}
console.log('OK');
