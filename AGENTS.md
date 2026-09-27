# AGENTS.md — contexto compartido del proyecto

> Memoria interna. TODOS los agentes leen esto al arrancar. **Solo el orquestador lo escribe** (los workers solo lo leen). El orquestador lo actualiza tras recibir reportes de los workers.

## Qué es este proyecto
[1-3 líneas]

## Stack

| Capa | Tech |
|---|---|

## Personas activas (roster)

- `orquestador` — rutea fases + aprueba planes
- `analyst` / `architect` / `pm` — tab **producto**
- `dev` — tab **desarrollo**
- `reviewer` — tab **qa**
- `ux` — tab **diseño**

## Fase actual
[qué está construido vs planeado]

- 2026-09-13 — Épica "system prompts por persona" DONE (architect → dev → reviewer):
  - `templates/prompts/<persona>.md` (7, en inglés): personalidad BMad, checklist de arranque, cuándo/cómo usar `herdr-bmad` y `/hermad`, comandos peer-to-peer, política de aprobación.
  - Entrega (todos los kinds): `agent wait idle` + `agent prompt` como primer mensaje (herdr rechaza args multilínea en `agent start`; fallo = log y sigue). Loader: `src/lib/prompts.js`.
  - `herdr.agentStart` acepta argv array; nuevo `herdr.agentWait`. Briefing del orquestador + `command/hermad.md` en inglés. Diseño: `docs/system-prompts-design.md`.
  - Pendiente: probar `hermad start-team` en vivo; `skill/scripts/orquestar.sh` no entrega prompts (copia de referencia).

- 2026-09-26 — Plan de mejoras aprobado (sin empezar): `docs/plan-mejoras.md`. 9 fases: spikes por vendor → CLI por cwd + `open-orchestrator` → system prompt por archivo → memoria 2 capas (AGENTS.md + journal) → skills por persona → `hermad daemon` (buzón + rutas) → compact 50% → `/hermad:orchestrate` con tracks + reader + `plan-devs` → `skills suggest`.

- 2026-09-27 — Fase 0 DONE (spikes): `docs/vendors.md` (matriz vendor × capacidades, celdas verificadas en vivo). Hallazgos que cambian el plan:
  - claude `--safe-mode` **también** mata `--plugin-dir` → descartado para allowlist. Mecanismo: `--setting-sources project,local` (oculta skills/plugins de usuario) + skills de persona en `.claude/skills/` del proyecto. `--append-system-prompt-file` existe ✔. deny `Skill(<ns>:<name>)` funciona; deny > allow.
  - hermes: persona/compact/skills **por profile** (`~/.hermes/profiles/<p>/{SOUL.md,config.yaml,skills/}`) → sin tocar el global.
  - opencode: `permission.skill` por agente; `compaction` sin umbral % → watchdog necesario.
  - herdr: args post-`--` van sin re-parsear, pero multilínea se rechaza → pasar rutas de archivo, no JSON inline.
  - codex/gemini no instalados → solo documentados (D1).

- 2026-09-27 — Fase 1 DONE (código + test unitario; falta prueba en vivo en TUI):
  - `src/lib/project.js#resolveProject(cwd)`: sube desde cwd buscando `.hermad/project.json`, migra el archivo a autocontenido (personas + departamentos), y lo marca activo. Fallback al activo global con aviso. `start-team`/`orchestrate` lo usan → `cd proyecto-B && hermad start-team` abre B.
  - Nuevo `hermad open-orchestrator` (workspace + solo el orquestador; el pane del daemon entra en Fase 5). `bootstrap` acepta `onlyOrchestrator`.
  - `create-project` ahora escribe `personas`/`departamentos` en `project.json`. HELP de `cli.js` actualizado. `npm test` (`node --test`, 3 tests) verde.
  - Pendiente: aceptación en vivo (`hermad start-team` desde B; `open-orchestrator` deja 1 agente).

- 2026-09-27 — Fases 2–8 DONE (código + 14 tests unitarios; falta aceptación en vivo en TUI):
  - **F2 prompt por archivo**: `src/lib/render.js` renderiza por proyecto. claude → `.hermad/generated/prompts/<p>.md` + plugin por persona + `--append-system-prompt-file` + `--setting-sources project,local`; opencode → `.opencode/agents/hermad-<p>.md` + `--agent`; hermes → `SOUL.md` + `--skills` (persona por prompt); otros → fallback. `vendors.startPlan`.
  - **F3 memoria 2 capas**: `src/lib/memory.js` (journal append-only, `hermad note`, `hermad memory slice`), `CLAUDE.md` con `@AGENTS.md`, hook `SessionStart` (startup|compact) en el plugin claude.
  - **F4 skills por persona**: frontmatter `skills:` en templates; `src/lib/skills.js` resuelve allowlist; claude la hornea en el plugin, opencode en `permission.skill` (deny \* + allow), hermes `--skills`. Skill inexistente → warning, no aborta.
  - **F5 daemon**: `src/lib/daemon.js` + `hermad daemon`/`send`. Pane propio (split del root antes de arrancar agentes), buzón `.hermad/inbox/<peer>/`, rutas por evento `HERMAD:DONE|BUG|STORIES_READY` (lee `agent read --source visible` al cambiar la pantalla), 3er BUG → escala al orquestador, `state.json` idempotente.
  - **F6 compact 50%**: claude por `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`; hermes por profile (documentado); watchdog en el daemon para opencode (parsea `%`; si no parsea, no actúa).
  - **F7 orquestación**: `templates/prompts/reader.md` (readonly), `/hermad:orchestrate` (`command/orchestrate.md`: claude `commands/hermad/orchestrate.md`, opencode flat), `src/lib/stories.js` + `hermad plan-devs` (worktrees+branches, evita solape de `files`, `max_devs=3`).
  - **F8**: `hermad skills suggest <persona>` (match LLM sobre skills instaladas; solo propone).
  - Tests: `npm test` → 14/14 (`node --test`). Docs: `docs/vendors.md`, `SKILL.md`, `docs/system-prompts-design.md` (marcado superado).

## Reglas del equipo

- Política de aprobación: auto, salvo auth/dinero/DB/seguridad → escala a Diego.
- Un solo writer al repo; stories paralelas → `git worktree`/branch.
- Peer-to-peer permitido (reviewer→dev, pm→devs); el orquestador coordina el top.
- Solo el orquestador escribe este archivo.
