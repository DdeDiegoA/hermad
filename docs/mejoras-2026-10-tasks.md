# Tareas por story — mejoras 2026-10

Fuente de verdad del alcance: `stories.yaml` (files + ac). Diseño: `docs/mejoras-2026-10-design.md`.
Cada dev trabaja **solo** en los `files` de su story, en su worktree `hermad/<story>`. Al cerrar: `npm test` verde,
commit en la branch, y emitir `HERMAD:DONE story=<id> n=1`.

Olas: **1** S1 · S2 · S6 → **2** S3a → **3** S3b · S3c · S5 → **4** S4 · S7

---

## S1 — lock + escritura atómica de `state.json` (`src/lib/daemon.js`)
1. `withStateLock(projectDir, fn)`: lockfile `.hermad/state.lock` (`fs.openSync(..., "wx")`), reintento cada 50 ms hasta 2 s; lock con mtime > 10 s = stale → borrar y tomar.
2. `saveState` → escribir `state.json.tmp-<pid>` + `fs.renameSync` (atómico).
3. `updateState(projectDir, mutator)`: lock → load fresco → mutator → save → unlock. Es la única API de escritura para los nuevos writers.
4. El tick del daemon: las llamadas lentas a herdr van **fuera** del lock; solo el merge final de sus claves va dentro de `updateState`.
5. `loadState` completa defaults (`rebounds, screens, markers, compact, stories, agents, closed`) sobre archivos viejos/ausentes.
6. Tests: clave escrita entre load y save sobrevive; lock stale; JSON nunca truncado; defaults.

## S2 — wrappers herdr + superficie CLI (`src/lib/herdr.js`, `src/cli.js`)
1. **Bug vivo:** `agentRead` no pasa por `call()`/`JSON.parse` — ejecutar `herdr agent read ... --format text` y devolver stdout crudo.
2. `paneClose(paneId)` → `herdr pane close <id>`; `tabRename(tabId, label)` → el comando verificado en el map. Ambos devuelven `{ok, code}` y no tiran.
3. Exportar ambos en `module.exports`.
4. `cli.js`: case `agents` → `require("./commands/agents").run(rest)` (lazy; el módulo lo crea S3a). HELP: `hermad agents`, `spawn --skills`, `send --skills`, `skills list|match|suggest [--global]|global add|rm`.
5. Tests (`test/herdr.test.js`, stub de `execFileSync`): agentRead devuelve texto sin parsear; paneClose/tabRename argv correctos y tolerantes a error.

## S6 — índice de skills + matcher + `globalSkills`
1. `src/lib/skills-index.js`: `build()` recorre `skills.globalRoots()+projectRoots()`, entradas `{id, name, description, dir, source}`; cache `~/.hermad/cache/skills-index.json` con `fingerprint` (mtimes de roots) + `builtAt`; reindexa si cambió el fingerprint, si pasaron 24 h, o con `refresh`.
2. `match(task, {persona, top=10})`: tokenizar (minúsculas, sin acentos, stopwords es/en), BM25-lite con name ×3 / description ×1, boost a las del frontmatter de la persona; excluye las globales efectivas (ya van siempre).
3. `src/lib/config.js`: `load()` conserva claves desconocidas (hoy solo guarda `personas` → borraría `globalSkills`); `globalSkills` en `~/.hermad/config.json`; override por proyecto en `project.json` `skills: {add:[], remove:[]}`; `effectiveGlobals(project)` = global + add − remove.
4. `src/commands/skills.js`: subcomandos `list [--refresh]`, `match "<tarea>" [--persona p] [--top n]`, `suggest <persona>` (sin cambios de contrato), `suggest --global` (propone; escribe solo tras confirmación interactiva y/n), `global add|rm <skill> [--force]` (rechaza nombres inexistentes salvo `--force`).
5. Tests: invalidación de cache, ranking, exclusión de globales, preservación de claves en config, add/rm.

## S3a — `src/lib/agents.js` + `hermad agents`
1. `agents.start({project, logical, persona, kind, paneId, args, skills}, io)`: intenta `logical`; si `agent_name_taken` → `<slug(project.name)>-<logical>`; una sola reintento por carrera; si el alias también está tomado → error que nombra ambos (sin sufijos numéricos).
2. Registrar `state.agents[logical] = {live, persona, kind, paneId, workspaceId, skills}` vía `updateState` (S1).
3. `liveName(projectDir, logical)` y `logicalOf(projectDir, live)` (fallback: identidad).
4. `src/commands/agents.js`: tabla lógico / vivo / persona / kind / pane.
5. Tests `test/agents.test.js`: libre, tomado, reuso, carrera, alias tomado, logicalOf, liveName.

## S3b — consumidores de agents.js
1. `daemon.js`: el tick mapea `agent list` (nombres vivos) → lógicos con `logicalOf`; buzón sigue en `.hermad/inbox/<logico>`; entrega, marcadores y compact contra el vivo; podar `state.agents` cuyo vivo falta 3 ticks.
2. `send.js`: normalizar destino vivo → lógico antes de encolar.
3. `spawn.js` y `plan-devs.js`: arrancar con `agents.start` (registra el map).
4. Tests de daemon y plan-devs con alias.

## S3c — prompts y comandos
1. En los 8 `templates/prompts/*.md` y `command/{hermad,orchestrate}.md`: para hablar con un peer, `hermad send <logico>` (resuelve solo); para herdr directo (`agent read/wait/send-keys`), resolver con `hermad agents`.
2. Orquestador: “siempre `hermad send`, nunca `agent prompt` a un worker”.

## S5 — departamento garantizado + tab `gerencia`
1. `personas-env.js` `DEFAULT_DEPARTAMENTOS`: `reader` en `producto`.
2. `placement.departmentFor`: normalizar `dev-N` → `dev`; si no hay entrada explícita → default; nunca `null` si hay departamentos.
3. `paneForAgent`: si fallan los dos intentos de move → `paneClose` del pane temporal y devolver `null` (el caller aborta con mensaje claro), en vez de dejarlo en el tab del orquestador.
4. Ignorar con aviso una entrada `gerencia` en `departamentos`.
5. `orchestrator.bootstrap`: tras `workspaceCreate`, `tabRename(tab default, "gerencia")` (fallo → log); arrancar con `agents.start`; el briefing muestra `logico→vivo` cuando difieren.
6. Tests en `test/placement.test.js` (actualizar el caso de `reader` sin departamento).

## S4 — auto-close (`src/lib/daemon.js`)
1. Registrar `lastDoneAt` por agente al ver `HERMAD:DONE` y `lastDeliveryAt` al entregar del buzón.
2. Cerrar (`paneClose`) si: DONE posterior a la última entrega ∧ idle 2 ticks seguidos ∧ buzón vacío ∧ no es orquestador ∧ si es dueño de una story, la story está `done` ∧ está en `state.agents` y en el `workspaceId` del proyecto ∧ `project.autoClose !== false`.
3. `paneClose` con not-found/unknown → marcar cerrado igual; otro error → log y reintentar.
4. Mensaje nuevo para un lógico cerrado → avisar una vez al orquestador para respawnear.
5. Tests: un caso por condición negada + idempotencia.

## S7 — skills por tarea según el vendor
1. `render.js`: artefactos por `agentName` (`generated/claude/<agent>`, `prompts/<agent>.md`, `.opencode/agents/hermad-<agent>.md`).
2. allowlist = frontmatter ∪ `effectiveGlobals` ∪ `--skills` (sin duplicados); separar lo nativo del vendor (plugin claude / `permission.skill` opencode / `--skills` hermes) de lo no nativo → bloque “Task skills: read these SKILL.md” con rutas absolutas en el prompt.
3. `spawn.js --skills a,b`; `send.js --skills a,b` adjunta rutas absolutas de `SKILL.md` (inexistente → warning).
4. `templates/prompts/orquestador.md`: antes de delegar, `hermad skills match "<tarea>" --persona <p>` → elegir → `--skills`.
5. `docs/vendors.md`: tabla de carga de skills agente nuevo vs vivo.
6. Tests `test/render.test.js`, `test/send-skills.test.js`.
