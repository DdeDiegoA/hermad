# Plan de mejoras — hermad

Fecha: 2026-09-26 · Estado: aprobado, sin empezar · Origen: sesión grill-me (decisiones abajo).

## Objetivos

1. System prompt real por vendor (no inyección como primer mensaje).
2. Memoria compartida que todos los agentes siempre cargan, en forma atómica.
3. Cada agente carga solo las skills de su persona (BMad y no-BMad).
4. Auto-compact al 50% de contexto.
5. Comunicación automática entre agentes sin pasar por el orquestador.
6. CLI: `start-team` detecta el proyecto hermad del cwd; nuevo `hermad open-orchestrator`.
7. Orquestación inteligente con `/hermad:orchestrate` (tracks, reader, plan-devs, gate).

## Decisiones tomadas

| # | Tema | Decisión |
|---|---|---|
| D1 | Vendors | Primera clase: `claude`, `opencode`, `hermes`. `codex`/`gemini`: solo documentados, fallback `agent prompt` en idle. |
| D2 | Archivos de persona | Renderizados **por proyecto** en cada arranque desde `templates/` (fuente de verdad). Generados → `.gitignore`. |
| D3 | Memoria | Dos capas: `AGENTS.md` curado (solo orquestador escribe) + `.hermad/memory/journal.md` append-only (todos escriben). Orquestador consolida. |
| D4 | Contexto atómico | Nadie recibe el journal completo: se inyecta `AGENTS.md` + entradas etiquetadas para su persona/story; el resto, grep a demanda. |
| D5 | Skills | Allowlist curada en frontmatter del template (runtime determinista) + `hermad skills suggest <persona>`: match semántico sobre skills **instaladas hoy**, respeta el rol del roster, solo propone. |
| D6 | Compact | Umbral nativo donde existe (claude, hermes). Watchdog en el daemon para vendors sin umbral (opencode). |
| D7 | Comunicación | Buzón `hermad send` + rutas declarativas por evento (`HERMAD:DONE`, `HERMAD:BUG`…). Límite 3 rebotes por story → escala al orquestador. |
| D8 | Daemon | Pane propio en el tab default (`hermad daemon`). Estado en disco (`.hermad/inbox/`, `.hermad/state.json`), idempotente al reiniciar. |
| D9 | Reader | Persona nueva `reader`: solo lectura, modelo barato, descartable. Entrega mapa atómico del código afectado. |
| D10 | Nº de devs | `hermad plan-devs` determinista: min(stories listas, sin solape de `files`, `max_devs`=3). Un `git worktree` + branch por dev. |
| D11 | Tracks | `quick` / `standard` / `full`, clasificado por el orquestador; forzable con `--track`. Gate humano único tras el plan (standard/full). |

## Hallazgos de investigación ya confirmados

- `claude 2.1.283`: `--append-system-prompt-file <path>` (arg de una línea → pasa por herdr), `--settings <json|file>`, `--plugin-dir`, `--safe-mode` (apaga CLAUDE.md, skills, plugins, hooks), env `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`.
- Claude Code lee `CLAUDE.md`, **no** `AGENTS.md` → hoy los agentes claude no cargan la memoria salvo que el prompt lo pida. Fix: `CLAUDE.md` con `@AGENTS.md`.
- `opencode 1.18.32`: `--agent <nombre>` carga `.opencode/agent/<nombre>.md` (prompt, modelo, tools, permisos); `--pure`; lee `AGENTS.md` nativo; `compaction.auto` sin umbral % conocido.
- `hermes 0.21`: `--skills a,b`, `--ignore-user-config`, `profile` (instancias aisladas). Tu global tiene `compression.threshold: 0.3` (compacta al 30%).
- `herdr 0.9.0`: rechaza args multilínea en `agent start` (`invalid_agent_argument`); `agent prompt` a un `blocked` → `agent_blocked`.
- `start-team.js:8` solo lee `~/.hermad/active-project.json` global; ignora cwd aunque `create-project.js:45-49` ya deja `<proyecto>/.hermad/project.json`.

## Fases

Orden por dependencia. Cada fase cierra con prueba en vivo (`hermad start-team` u `open-orchestrator` en un proyecto de prueba) y entrada en `AGENTS.md`.

### Fase 0 — Spikes (investigación, sin código de producto)

| Spike | Pregunta | Salida |
|---|---|---|
| S1 | hermes: ¿un `profile` lleva system prompt propio (SOUL/persona)? ¿umbral `compression` por profile o por flag? | Mecanismo elegido para prompt + compact |
| S2 | claude: ¿`--safe-mode` + `--plugin-dir <plugin>` carga skills, hooks y `CLAUDE.md` del plugin? Plan B: `--settings` con deny de skills | Mecanismo de allowlist claude |
| S3 | opencode: ¿permisos por skill en el agente `.md`? ¿umbral de compaction configurable? | Allowlist + necesidad real del watchdog |
| S4 | herdr: `agent start` con `--settings '<json>'` y rutas `-file` (comillas, espacios) | Forma de argv segura |
| S5 | Slash namespaced `/hermad:orchestrate` en claude (`commands/hermad/orchestrate.md`) y opencode | Layout de comandos |
| S6 | codex/gemini: documentar `model_instructions_file` / `GEMINI_SYSTEM_MD` y skills | Sección en `docs/vendors.md` |

Criterio: `docs/vendors.md` con tabla vendor × {system prompt, memoria, skills, compact, comandos}, cada celda verificada o marcada "no soportado".

### Fase 1 — CLI: proyecto por cwd + `open-orchestrator`

- `src/lib/project.js`: `resolveProject(cwd)` sube buscando `.hermad/project.json`; fallback `active-project.json` con aviso de cuál usó. Al resolver, actualiza el activo.
- `project.json` guarda también `personas` y `departamentos` (autocontenido). Migración: si faltan, completar desde `config.json` + `DEFAULT_DEPARTAMENTOS`.
- `start-team`, `orchestrate`, `open-orchestrator` usan `resolveProject`.
- `hermad open-orchestrator`: workspace + solo el pane del orquestador + pane del daemon (desde Fase 5). Workers se dropean bajo demanda.
- `src/cli.js` HELP actualizado.

Aceptación: `cd proyecto-B && hermad start-team` abre B aunque el último `create-project` fuera A; `open-orchestrator` deja 1 agente vivo.

### Fase 2 — System prompt real por vendor (depende de 0)

- `src/lib/render.js`: renderiza `templates/prompts/<persona>.md` al proyecto:
  - claude → `.hermad/generated/prompts/<persona>.md` + `--append-system-prompt-file`.
  - opencode → `.opencode/agent/hermad-<persona>.md` + `--agent hermad-<persona>`.
  - hermes → según S1.
  - otros → fallback actual (`agentWait idle` + `agentPrompt`).
- `orchestrator.js#startAgentSafe`: argv por vendor desde una tabla en `vendors.js` (adaptadores por archivo solo si aparecen ≥2 diferencias reales por vendor).
- `.gitignore` del proyecto: `.hermad/generated/`, `.opencode/agent/hermad-*`.
- Actualizar `SKILL.md` (sección System prompts), `docs/system-prompts-design.md` (marcar superado) y el comentario de `herdr.js:61`.

Aceptación: agente claude/opencode arranca con persona sin mensaje inicial visible en el TUI.

### Fase 3 — Memoria de dos capas (depende de 2)

- `create-project` / render: `CLAUDE.md` del proyecto con `@AGENTS.md` (si no existe; si existe, agregar import una vez).
- `.hermad/memory/journal.md`: formato de entrada `- <ISO> [<agente>] [story:<id>|persona:<p>|all] <texto ≤2 líneas>`.
- `hermad note "<texto>" [--story X] [--for persona]` escribe con append (`fs.appendFileSync`, una línea por entrada).
- Inyección atómica: `hermad memory slice <persona> [--story X]` imprime `AGENTS.md` + entradas etiquetadas. Se usa en el system prompt renderizado y en hooks.
- Hooks claude (vía plugin/settings de S2): `SessionStart` (matcher `startup|compact`) → `memory slice`.
- Orquestador: instrucción de consolidar journal → `AGENTS.md` al cerrar cada fase del track.
- Corregir `SKILL.md:136` (Claude Code no lee `AGENTS.md` nativo).

Aceptación: dev escribe nota, reviewer la ve en su próximo arranque/compact sin recibir notas de otras stories.

### Fase 4 — Skills por persona (depende de 0, 2)

- Frontmatter en cada template: `skills: [...]` (BMad + no-BMad, p.ej. dev: `bmad-agent-dev`, `bmad-build`, `herdr-bmad`, `tdd-workflow`).
- Aplicación por vendor según S2/S3: claude plugin generado por persona; opencode permisos del agente; hermes `--skills`.
- Validación al arrancar: skill inexistente → warning, no aborta.

Aceptación: `hermes prompt-size` / equivalente por vendor muestra solo las skills de la allowlist en cada agente.

### Fase 5 — `hermad daemon`: buzón + rutas (depende de 3)

- Pane `daemon` en tab default, creado por `start-team`/`open-orchestrator`.
- `hermad send <peer> "<msg>"` → `.hermad/inbox/<peer>/<ts>-<from>.md`. Daemon entrega con `agent prompt` cuando el peer está `idle`; nunca a `blocked`/`working`. Entregado → mover a `inbox/<peer>/done/`. Copia al journal.
- Rutas en `project.json`:
  ```json
  "routes": [
    { "on": "DONE", "from": "dev", "to": "reviewer" },
    { "on": "BUG", "from": "reviewer", "to": "dev" },
    { "on": "STORIES_READY", "from": "pm", "to": "orquestador" }
  ]
  ```
- Eventos: línea marcadora estricta `HERMAD:<EVENTO> story=<id> [k=v]` leída con `agent read` al pasar a `idle`.
- `state.json`: rebotes por story; al 3º `BUG` de la misma story → mensaje al orquestador en vez de al dev.
- Poll cada 5 s (polling simple; socket API de herdr si el poll pesa).
- Templates de persona: reemplazar `herdr agent prompt <peer>` por `hermad send` y documentar los marcadores.

Aceptación: dev emite `HERMAD:DONE story=S1` → reviewer recibe la tarea sin intervención; restart del daemon no duplica mensajes.

### Fase 6 — Auto-compact al 50% (depende de 5)

- claude: `--settings '{"env":{"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE":"50"}}'` por agente.
- hermes: 0.5 por profile/flag (S1), sin tocar `~/.hermes/config.yaml`.
- Watchdog en el daemon, solo para vendors sin umbral nativo: parsea el % de contexto de `agent read --source visible`; si ≥50% y `idle` → `agent prompt <a> "/compact"`. Si no puede parsear el %, loguea y no actúa.
- `compact_pct` configurable en `project.json` (default 50).

Aceptación: agente opencode con contexto >50% se compacta en idle; claude compacta al 50% nativo y reinyecta memoria (hook Fase 3).

### Fase 7 — Orquestación inteligente (depende de 1, 2, 3, 5)

- Persona `reader`: `templates/prompts/reader.md`, solo lectura (sin Edit/Write por permisos del vendor), modelo barato por defecto; entrega `.hermad/memory/reader-<story|intent>.md` (mapa: archivos, flujos, puntos de impacto) y `HERMAD:DONE`. Se cierra al terminar.
- Comando `/hermad:orchestrate <intent> [--track quick|standard|full]` (layout según S5). Reemplaza el protocolo de `command/hermad.md`.
- Tracks:

  | Track | Flujo |
  |---|---|
  | quick | reader → dev → reviewer |
  | standard | reader → architect → pm (SPEC + stories) → `plan-devs` → N devs → reviewer → merge |
  | full | analyst → pm (brief/PRD) → architect → ux (si hay UI) → pm (stories) → N devs → reviewer → retro |

  El orquestador anuncia track + razón en una línea.
- Gate humano único (standard/full) tras plan: notificación con `SPEC.md`, `stories.yaml` y nº de devs; espera confirmación. Gates de auth/dinero/DB/seguridad siguen igual.
- `stories.yaml` schema: `id`, `depends_on`, `files`, `ac`. Template pm actualizado.
- `hermad plan-devs`: lee `stories.yaml`, calcula N = min(listas, sin solape de `files`, `max_devs`); stories sin `files` → cola secuencial. Crea `git worktree` + branch `hermad/<story>` por dev y dropea `dev-1..N`.
- Merge: tras `DONE` del reviewer por story, orquestador mergea branch (conflicto → gate humano).
- Rutas de Fase 5 cubren los handoffs; orquestador solo en clasificación, gate, merge y escalaciones.

Aceptación: "implementemos X en el backend" en proyecto de prueba corre track standard end-to-end con 2 devs paralelos en worktrees y un solo gate.

### Fase 8 — `hermad skills suggest` (depende de 4)

- Lista skills instaladas por vendor (dirs de skills + plugins), extrae `name` + `description`.
- Match semántico contra rol + descripción de la persona (una llamada LLM vía CLI del vendor del orquestador).
- Salida: diff propuesto al frontmatter `skills:`; nunca aplica sin confirmación.

## Fuera de alcance

- codex/gemini de primera clase (solo documentados, D1).
- Servidor MCP de memoria (upgrade si el journal crece, D3).
- Daemon fuera de herdr (launchd) (D8).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| S2 falla: claude no permite allowlist sin perder hooks | Plan B `--settings` deny; peor caso, allowlist blanda por prompt en claude |
| Parseo de % de contexto frágil (watchdog) | No actuar si no parsea; log visible en pane daemon |
| Marcadores `HERMAD:` no emitidos por el modelo | Templates con formato exacto; daemon también acepta `hermad send` explícito |
| Merge conflicts entre devs paralelos | `plan-devs` evita solape de `files`; conflicto → gate humano |
