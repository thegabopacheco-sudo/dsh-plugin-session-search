# How dsh-plugin-session-search works

Buscador del historial de sesiones de DeepSeek Harness: indexa sesiones locales (transcripciones zstd y cache de proyeccion), busca por texto, lista recientes y extrae fragmentos.

## Architecture

```
DSH ──MCP stdio──► server.mjs (single-file bundle)
                    └─ local plugin logic
```

## Safety

- Read by default; actions require `confirm:true`.
- `read-only` mode via environment variable.
- Allowlists where applicable.
- Audit at `<DSH_HOME>\cache\session-search\audit.jsonl`.
- Action rate limit.

## Validation

End-to-end tests with the official MCP client (`@modelcontextprotocol/client@2.2.0`)
and the packaged artifact (`npm pack` → `postinstall` → deployed server).
