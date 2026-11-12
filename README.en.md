# dsh-plugin-session-search — Session Search

Buscador del historial de sesiones de DeepSeek Harness: indexa sesiones locales (transcripciones zstd y cache de proyeccion), busca por texto, lista recientes y extrae fragmentos.

## Tools

| Tool | Qué hace |
|---|---|
| `status` | Estado |
| `recent` | Sesiones recientes |
| `search` | Buscar en sesiones |
| `read` | Leer sesión |

## Instalación

Desde **DSH → Settings → Plugins** instala `github:thegabopacheco-sudo/dsh-plugin-session-search` y permite el script de instalación.

```
dsh plugin --profile <perfil> add github:thegabopacheco-sudo/dsh-plugin-session-search
```

## Seguridad

- Lectura por defecto; escritura solo con `confirm:true` y pedido explícito.
- `DSH_SESSION_SEARCH_MODE=read-only` desactiva acciones.
- Listas blancas y auditoría en `<DSH_HOME>\cache\session-search\audit.jsonl`.

## Licencia

MIT © thegabopacheco-sudo
