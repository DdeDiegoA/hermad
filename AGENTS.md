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

- 2026-10-03 — Épica "mejoras 2026-10" DONE (track standard; reader → architect → pm → 9 stories en 4 olas → reviewer). 120 tests verdes.
  - Docs: `docs/mejoras-2026-10{,-map,-design,-tasks}.md`, `SPEC.md`, `stories.yaml`.
  - (1) `src/lib/agents.js`: nombre lógico ↔ vivo; si está tomado → `<proyecto>-<persona>`; `hermad agents` lista el mapa; buzón/rutas siguen lógicos.
  - (2) auto-close en el daemon: DONE + quiescente (`idle`|`done`) 2 ticks; nunca orquestador, buzón pendiente ni dev con story abierta; `autoClose: false` lo apaga. Verificado en vivo.
  - (3)(4) `placement` garantiza tab de departamento (default por persona, `dev-N`→desarrollo; si el move falla cierra el pane y aborta); tab default → `gerencia` (en workspaces nuevos).
  - (5) `hermad skills list|match|suggest [--global]|global add|rm` (índice cacheado en `~/.hermad/cache`, BM25 local); `globalSkills` en `~/.hermad/config.json` (+ `skills.add/remove` por proyecto); `spawn/send --skills` cargan por vendor, lo no nativo va como rutas SKILL.md.
  - Fixes en vivo: `herdr.agentRead` parseaba JSON sobre texto (rutas nunca funcionaron); marcadores ahora solo por línea exacta + dedupe por identidad `evento|story|n` (re-emitir = `n` nuevo); `project.hydrate` descartaba `routes`/`autoClose`/`skills`; `config.save` mergea con disco (no borra `globalSkills`).
  - Pendientes post-épica: auto-close cierra a un agente lanzado con `spawn` (no `plan-devs`) apenas emite DONE, aunque el reviewer aún no aprobó — la guarda de story solo mira `state.stories` (pasó con CORE-ORQ); `normalizePersona` corta en el primer `-`; aviso de ruta escueto (agregar branch/commit); `hermad send` acepta destinos con espacios; aviso `gerencia` repetido; agentes lanzados antes de S3b no están en `state.agents` (no se auto-cierran); Diego debe correr `hermad skills suggest --global`; aceptación en vivo de `open-orchestrator` con colisión de nombre.

- 2026-10-04 — Configuración de skills (Diego):
  - `globalSkills` (`~/.hermad/config.json`): `caveman:caveman`, `ponytail:ponytail`, `herdr-bmad`, `andrej-karpathy-skills:karpathy-guidelines`, `graphify` (+ `bmad-help` por proyecto). Se cargan en todos los agentes; las no nativas del vendor (p. ej. plugins de claude en opencode/hermes) van por ruta SKILL.md — aceptado el costo de contexto.
  - Frontmatter de personas: sin `herdr-bmad`, `rag-pipeline` ni `graphify` (SKILLS-CFG mergeada 79b62f2; reader `skills: []`).
  - SKILLS-KARPATHY mergeada: el "drop de karpathy" fue falsa alarma (script de review con lista hardcodeada); quedó hardening (namespace por manifest) + stemming en `skills match`. 6/6 globales verificadas en los 4 vendors.
  - `bmad-help` movida de global a proyecto (`project.json` → `skills.add`), porque es project-scoped: globales = 5 (caveman, ponytail, herdr-bmad, karpathy-guidelines, graphify); en proyectos con BMad agregar `hermad skills global add bmad-help --project`.
  - Skills por tarea: el orquestador corre `hermad skills match` antes de CADA delegación y pasa todas las relevantes con `--skills` (sin tope), y las reporta.

## Reglas del equipo

- **Regla inviolable: el orquestador SOLO delega.** Nunca edita código/docs/tests/configs, nunca hace hotfixes (ni urgentes), nunca corre tests ni investiga código: spawnea/manda al peer correcto. Excepciones: comandos hermad/herdr, merges aprobados por el reviewer, AGENTS.md y journal. (Diego, 2026-10-03; horneada en `templates/prompts/orquestador.md`, commands y briefing — CORE-ORQ mergeada, test `test/orquestador-rule.test.js`.)
- Política de aprobación: auto, salvo auth/dinero/DB/seguridad → escala a Diego.
- Un solo writer al repo; stories paralelas → `git worktree`/branch.
- Peer-to-peer permitido (reviewer→dev, pm→devs); el orquestador coordina el top.
- Solo el orquestador escribe este archivo.
