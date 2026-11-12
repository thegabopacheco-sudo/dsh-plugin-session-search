#!/usr/bin/env node
// dsh-plugin-session-search — busca en el historial de sesiones del harness.
// Tools: status, recent, search, read.

import path from 'node:path';
import os from 'node:os';
import { zstdDecompressSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const VERSION = '0.1.0';
const DSH_HOME = (() => {
  const v = process.env.DSH_HOME && process.env.DSH_HOME.trim();
  return v || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.dsh');
})();
const SESSIONS_ROOT = path.join(DSH_HOME, 'sessions');
const PROJECTION_ROOT = path.join(DSH_HOME, 'storages', 'session_projcache', 'sessions');
const MAX_DECOMPRESSED_BYTES = 40 * 1024 * 1024;
const MAX_SESSIONS_SCAN = 300;
const log = (m) => process.stderr.write(`[sessions] ${m}\n`);

function safeDir(name) { try { return readdirSync(name, { withFileTypes: true }); } catch { return []; } }

function decodeSession(sessionPath) {
  const compressed = readFileSync(sessionPath);
  if (compressed.length > MAX_DECOMPRESSED_BYTES / 20) {
    // evita descomprimir archivos gigantes por completo
  }
  const buffer = zstdDecompressSync(compressed);
  if (buffer.length > MAX_DECOMPRESSED_BYTES) throw new Error('sesión demasiado grande para indexar');
  return buffer.toString('utf8');
}

function readProjection(sessionId) {
  const file = path.join(PROJECTION_ROOT, `${sessionId}.json`);
  if (!existsSync(file)) return {};
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) || {};
    const record = data.record || {};
    const title = record.rows?.title?.val;
    return { title: typeof title === 'string' ? title : null, cwd: record.identity?.cwd || null, createdAt: record.identity?.createdAt || null };
  } catch { return {}; }
}

function listSessions() {
  const sessions = [];
  for (const workspaceEntry of safeDir(SESSIONS_ROOT)) {
    if (!workspaceEntry.isDirectory()) continue;
    const workspaceDir = path.join(SESSIONS_ROOT, workspaceEntry.name);
    for (const sessionEntry of safeDir(workspaceDir)) {
      if (!sessionEntry.isDirectory()) continue;
      const file = path.join(workspaceDir, sessionEntry.name, 'session.v4.jsonl.zstd');
      if (!existsSync(file)) continue;
      const stat = statSync(file);
      sessions.push({ sessionId: sessionEntry.name, workspace: workspaceEntry.name.replace(/^--/, '').replace(/--$/, ''), file, size: stat.size, mtime: stat.mtimeMs, ...readProjection(sessionEntry.name) });
    }
  }
  return sessions.sort((a, b) => b.mtime - a.mtime).slice(0, MAX_SESSIONS_SCAN);
}

function cleanJsonString(value) {
  try { return JSON.parse(`"${value.replace(/"/g, '\\"').replace(/\\\\"/g, '\\"')}"`); } catch { return value.replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\'); }
}

function extractTexts(sessionText, limit = 400) {
  const texts = [];
  const regex = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let match;
  while ((match = regex.exec(sessionText)) && texts.length < limit) {
    const text = cleanJsonString(match[1]).trim();
    if (text.length >= 2) texts.push(text);
  }
  return texts;
}

function snippetAround(text, query, radius = 90) {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return text.slice(0, radius * 2);
  return `${index > radius ? '…' : ''}${text.slice(Math.max(0, index - radius), index + query.length + radius).replace(/\s+/g, ' ')}${index + radius * 2 < text.length ? '…' : ''}`;
}

function textResult(t) { return { content: [{ type: 'text', text: t }] }; }

function buildInstructions() {
  return [
    'Session Search: busca en el historial local de sesiones del harness.',
    '',
    `Sesiones: ${SESSIONS_ROOT}`,
    '',
    'Herramientas: status, recent, search, read.',
    '',
    'Reglas:',
    '- Solo lectura: no modifica sesiones ni índices.',
    '- search busca en títulos (caché de proyección) y en el texto de las transcripciones.',
    '- Muestra fragmentos reales; no inventes contenido que no esté en las sesiones.',
    '- Puede tardar en historiales grandes: usa consultas concretas.',
  ].join('\n');
}

function buildServer() {
  const server = new McpServer({ name: 'dsh-plugin-session-search', version: VERSION }, { capabilities: { tools: {} }, instructions: buildInstructions() });

  server.registerTool(
    'status',
    { title: 'Estado', description: 'Sesiones disponibles, raíces y soporte zstd.', inputSchema: z.object({}) },
    async () => {
      const sessions = listSessions();
      const totalBytes = sessions.reduce((sum, s) => sum + s.size, 0);
      return textResult([`Sesiones indexables: ${sessions.length}`, `Tamaño comprimido: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`, `Raíz: ${SESSIONS_ROOT}`, `Caché de proyección: ${PROJECTION_ROOT}`, `zstd: ${typeof zstdDecompressSync === 'function' ? 'disponible' : 'NO disponible'}`].join('\n'));
    },
  );

  server.registerTool(
    'recent',
    { title: 'Sesiones recientes', description: 'Lista las sesiones más recientes con título, workspace y fecha.', inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }) },
    async (args) => {
      const sessions = listSessions().slice(0, args.limit ?? 15);
      if (sessions.length === 0) return textResult(`Sin sesiones en ${SESSIONS_ROOT}.`);
      return textResult(sessions.map((s) => `${new Date(s.mtime).toISOString()} · ${s.title || '(sin título)'} · ${s.cwd || s.workspace} · ${(s.size / 1024 / 1024).toFixed(1)} MB · id ${s.sessionId}`).join('\n'));
    },
  );

  server.registerTool(
    'search',
    {
      title: 'Buscar en sesiones',
      description: 'Busca texto en títulos y transcripciones y devuelve fragmentos.',
      inputSchema: z.object({ query: z.string().min(2).max(120), limit: z.number().int().min(1).max(20).optional() }),
    },
    async (args) => {
      const query = args.query;
      const sessions = listSessions();
      const hits = [];
      for (const session of sessions) {
        let matches = 0;
        const snippets = [];
        if (session.title && session.title.toLowerCase().includes(query.toLowerCase())) { matches++; snippets.push(`título: ${session.title}`); }
        try {
          const text = decodeSession(session.file);
          const texts = extractTexts(text, 600);
          for (const chunk of texts) {
            if (chunk.toLowerCase().includes(query.toLowerCase())) {
              matches++;
              if (snippets.length < 3) snippets.push(snippetAround(chunk, query));
            }
          }
        } catch (error) {
          snippets.push(`(no se pudo leer: ${error.message})`);
        }
        if (matches > 0) hits.push({ ...session, matches, snippets });
        if (hits.length >= (args.limit ?? 8)) break;
      }
      if (hits.length === 0) return textResult(`Sin resultados para "${query}" en ${sessions.length} sesión(es).`);
      return textResult(hits.map((hit) => `• ${hit.title || '(sin título)'} · ${hit.cwd || hit.workspace}\n  ${new Date(hit.mtime).toISOString()} · ${hit.matches} coincidencia(s) · id ${hit.sessionId}\n  ${hit.snippets.join('\n  ')}`).join('\n\n'));
    },
  );

  server.registerTool(
    'read',
    {
      title: 'Leer sesión',
      description: 'Devuelve fragmentos de texto de una sesión por id (o la más reciente).',
      inputSchema: z.object({ sessionId: z.string().optional(), limit: z.number().int().min(1).max(200).optional() }),
    },
    async (args) => {
      const sessions = listSessions();
      const session = args.sessionId ? sessions.find((s) => s.sessionId.toLowerCase() === args.sessionId.toLowerCase() || s.sessionId.startsWith(args.sessionId)) : sessions[0];
      if (!session) throw new Error(`sesión no encontrada: ${args.sessionId || '(ninguna)'}`);
      const texts = extractTexts(decodeSession(session.file), args.limit ?? 40);
      if (texts.length === 0) return textResult(`Sesión ${session.sessionId}: sin texto extraíble.`);
      return textResult([`${session.title || '(sin título)'} · ${session.cwd || session.workspace}`, `id ${session.sessionId} · ${new Date(session.mtime).toISOString()}`, '', ...texts.map((text, index) => `[${index + 1}] ${text.slice(0, 400)}`)].join('\n'));
    },
  );

  return server;
}

try { mkdirSync(path.join(DSH_HOME, 'cache', 'session-search'), { recursive: true }); } catch { /* ignora */ }
log(`sesiones: ${SESSIONS_ROOT} · projcache: ${PROJECTION_ROOT}`);
serveStdio(buildServer, { onerror: (e) => log(`serveStdio: ${e.message}`) });
process.on('uncaughtException', (e) => log(`excepción: ${e.message}`));
process.on('unhandledRejection', (e) => log(`rechazo: ${e && e.message ? e.message : String(e)}`));
