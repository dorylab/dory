# Dory

**Dory es un cliente SQL AI-native para humanos y agentes.**

Dory es un workspace SQL donde las personas pueden consultar, explorar y visualizar datos, y donde los agentes de IA pueden trabajar con bases de datos de forma segura mediante MCP.

A diferencia de un database MCP server básico que solo devuelve resultados a un chat, Dory convierte el trabajo del agente en workspaces SQL editables: pestañas SQL, result sets, gráficos, consultas guardadas y contexto de ejecución que las personas pueden abrir, inspeccionar, modificar y continuar.

Usa Dory como tu cliente SQL diario o como la capa de ejecución de bases de datos para agentes como Claude Code, Codex CLI y otras herramientas compatibles con MCP.

## Why Dory?

Los agentes de IA ya pueden escribir SQL, inspeccionar schemas y responder preguntas analíticas. Pero el output bruto de un agente no basta para el trabajo real con datos.

Los equipos aún necesitan:

- ver el SQL exacto que se ejecutó
- inspeccionar result sets reales
- corregir consultas incorrectas
- convertir resultados en gráficos o exports
- preservar contexto entre pasos
- continuar el trabajo en un workspace SQL real

Dory está construido para este flujo.

## How Dory works

Dory ofrece las mismas acciones de base de datos a la UI y a los agentes:

- Las personas usan Dory como cliente SQL: escriben SQL, navegan el schema, ejecutan consultas, filtran resultados, crean gráficos y guardan consultas.
- Los agentes usan Dory mediante MCP: listan conexiones, exploran schemas, ejecutan SQL de solo lectura, crean pestañas y organizan trabajo de base de datos.
- El trabajo generado por agentes se convierte en un workspace real que las personas pueden revisar, editar y continuar.

## Dory vs Plain Database MCP Server

| Capability | Plain DB MCP Server | Dory |
| --- | ---: | ---: |
| Ejecutar SQL desde agentes | Yes | Yes |
| Explorar schema | Yes | Yes |
| Pestañas SQL editables | No | Yes |
| Result sets persistentes | No | Yes |
| Gráficos y filtros | No | Yes |
| Flujo de revisión humana | Limited | Yes |
| Consultas guardadas y contexto de workspace | Limited | Yes |
| Funciona como cliente SQL diario | No | Yes |

## Key Features

### Workspaces editables para agentes

El trabajo de base de datos de un agente no debería perderse en una transcripción de chat.

- Abre pestañas SQL creadas por agentes como pestañas normales del workspace
- Inspecciona SQL, result sets, filtros, gráficos y contexto guardado
- Edita el SQL generado y ejecútalo de nuevo
- Continúa un Agent Run desde el mismo workspace en lugar de empezar desde cero

### Desktop MCP para Claude Code / Codex CLI

La app de escritorio de Dory expone un endpoint MCP local para que agentes externos usen tus conexiones de Dory sin copiar tokens manualmente.

- Funciona con Claude Code, Codex CLI y otros clientes compatibles con MCP
- Usa la lista de conexiones, inspección de schema, consultas guardadas y ejecución SQL de solo lectura de Dory
- Mantiene los grants de Desktop MCP gestionados por Dory, sin pedir a usuarios normales que manejen tokens

### Workspace SQL para humanos

- Editor SQL multi-tab con soporte para múltiples result sets
- Explorador de schema para tablas, columnas y objetos de base de datos
- Consultas guardadas para análisis reutilizable
- Historial de ejecución y contexto de workspace integrados

### Result sets, filtros y gráficos

- Inspecciona result sets reales en vista de tabla
- Filtra, busca y revisa filas devueltas
- Convierte resultados en gráficos dentro del workspace
- Mantén los resultados conectados con el SQL que los produjo

### Asistencia de IA con conocimiento del schema

Un asistente de IA basado en el schema real de la base de datos y el contexto de la consulta actual.

- Genera SQL desde lenguaje natural
- Reescribe, corrige y explica SQL en la pestaña actual
- Usa el schema actual y el contexto de la consulta
- Mantiene la asistencia de IA dentro del workspace SQL real

### Consultas guardadas y contexto reutilizable

- Guarda SQL útil como consultas reutilizables
- Organiza trabajo de consulta entre conexiones y workspaces
- Permite que personas y agentes construyan sobre trabajo anterior
- Preserva contexto más allá de una sola respuesta de chat

### Soporte de bases de datos

Dory es un cliente SQL multi-base de datos, con amplio soporte de drivers e integraciones más profundas donde Dory puede ofrecer más que ejecución SQL genérica.

| Database | Status |
| --- | --- |
| ClickHouse | Deeply integrated |
| PostgreSQL | Supported |
| Neon | Supported |
| MySQL | Supported |
| MariaDB | Supported |
| SQLite | Supported |
| DuckDB | Supported |
| SQL Server | Supported |
| Oracle | Supported |
| Snowflake | Planned |

### Integración profunda con ClickHouse

Dory incluye superficies nativas de operación para equipos que necesitan más que un editor SQL genérico para ClickHouse.

- Monitoreo de queries con slow queries, errores, usuarios activos, latencia y throughput
- Filtros multidimensionales por usuario, base de datos, tipo de query y rango de tiempo
- Gestión de usuarios y roles sin escribir manualmente cada `GRANT` o `CREATE USER`
- Operaciones de privilegios a nivel cluster con soporte On Cluster

## Quick Start

### Instalar en macOS con Homebrew

```bash
brew install dorylab/dory/dory
```

### Ejecutar con Docker

```bash
docker run -d --name dory \
  -p 3000:3000 \
  -e DS_SECRET_KEY="$(openssl rand -base64 32 | tr -d '\n')" \
  -e BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  -e BETTER_AUTH_URL="http://localhost:3000" \
  -e DORY_AI_PROVIDER=openai \
  -e DORY_AI_MODEL=gpt-4o-mini \
  -e DORY_AI_API_KEY=your_api_key_here \
  -e DORY_AI_URL=https://api.openai.com/v1 \
  -e NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION=false \
  -e DORY_INIT_USER_EMAIL=admin@getdory.dev \
  -e DORY_INIT_USER_PASSWORD=admin \
  dorylab/dory:latest
```

Cuenta inicial de administrador:

`Username: admin@getdory.dev`

`Password: admin`

### Self-host con Docker Compose

```bash
cp docker-compose.env.example .env
# Edita .env y reemplaza todos los secrets/passwords placeholder.
docker compose up -d
```

Para documentación completa de self-hosting, consulta [Self-Hosting Documentation](https://www.getdory.dev/docs/deploy/self-hosting).

## Desktop MCP

La app de escritorio de Dory incluye soporte MCP local, para que clientes de agente usen tus conexiones de Dory sin copiar tokens API manualmente.

Para activarlo:

1. Abre la app de escritorio de Dory.
2. Ve a **Settings → Agent Access**.
3. Activa **Enable**.
4. Agrega el endpoint local mostrado a tu cliente MCP.

Por defecto, Desktop MCP corre en:

```text
http://127.0.0.1:3318/api/mcp
```

Para Codex CLI:

```bash
codex mcp add dory --url http://127.0.0.1:3318/api/mcp
codex mcp list
```

Para Claude Code:

```bash
claude mcp add --transport http dory http://127.0.0.1:3318/api/mcp
claude mcp list
```

Dory gestiona automáticamente el Desktop MCP grant. El endpoint MCP local puede listar conexiones, inspeccionar schemas, leer consultas guardadas, previsualizar tablas, ejecutar SQL de solo lectura y construir contexto analítico para bases de datos conectadas.

## Supported AI Providers

Dory está construido con una arquitectura de AI providers conectable. Puedes cambiar de proveedor mediante variables de entorno, sin cambios de código.

| Provider | Env `DORY_AI_PROVIDER` | Description |
| --- | --- | --- |
| OpenAI | `openai` | OpenAI official API |
| OpenAI-Compatible | `openai-compatible` | OpenAI-compatible API services |
| Anthropic | `anthropic` | Claude models via Anthropic official API |
| Google | `google` | Gemini models via Google Generative AI API |
| Qwen (Alibaba) | `qwen` | Qwen via DashScope OpenAI-compatible endpoint |
| xAI | `xai` | Grok models via xAI API |

## Roadmap

- [Dory Roadmap](../ROADMAP.md)
- [GitHub Discussion #35](https://github.com/dorylab/dory/discussions/35)

## License

Apache-2.0
