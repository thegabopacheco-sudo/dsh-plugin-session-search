# Cómo funciona dsh-plugin-session-search

Buscador del historial de sesiones de DeepSeek Harness: indexa sesiones locales (transcripciones zstd y cache de proyeccion), busca por texto, lista recientes y extrae fragmentos.

## Arquitectura

```
DSH ──MCP stdio──► server.mjs (bundle single-file)
                    └─ lógica local del plugin
```

## Herramientas reales

- `status`: Estado
- `recent`: Sesiones recientes
- `search`: Buscar en sesiones
- `read`: Leer sesión

## Seguridad

- Lectura por defecto; acciones con `confirm:true`.
- Modo `read-only` por variable de entorno.
- Listas blancas cuando aplique.
- Auditoría en `<DSH_HOME>\cache\session-search\audit.jsonl`.
- Rate limit de acciones.

## Verificación

Tests end-to-end con el cliente MCP oficial (`@modelcontextprotocol/client@2.2.0`)
y artefacto empaquetado (`npm pack` → `postinstall` → servidor desplegado).
