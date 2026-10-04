# Code map — mejoras 2026-10

> READ-ONLY map by reader. Método: `graphify query` (herdr.js nodes/callers) + grep + lectura directa. Sin cambios de código.

Files cited as `path:line`. Same layout per item: files/functions, current behavior, all call paths, tests.

---

## Item 1 — Agent name collisions across projects (`agent_name_taken`)

**Files / functions**
- `src/lib/herdr.js:104` `agentStart(name, kind, paneId, vendorArgs, opts)` — único wrapper de `herdr agent start`; retry en `agent_pane_busy`. No traduce/renombra en colisión.
- `src/lib/orchestrator.js:98` `startAgentSafe(name, persona, paneId, plan)` — catch `agent_name_taken` → log `[=]` y **return** (no aborta). Nombre = la clave persona literal.
- `src/lib/orchestrator.js:44` `bootstrap` — arranca orquestador con nombre fijo `"orquestador"` (`herdr.agentStart(name,...)`), root pane.
- `src/lib/orchestrator.js:59-65` — workers con `name` = clave de persona tal cual sale de `departamentos`.
- `src/commands/spawn.js:42` — `name = opt("--name") || (opt("--kind")||opt("--model") ? \`${persona}-${kind}\` : persona)`. Persona cruda cuando no hay override.
- `src/commands/plan-devs.js:91,135` — `allocateDevs` genera `dev-N`; `herdr.agentStart(dev, ...)` con ese nombre.
- `src/lib/render.js:107` — `env.HERMAD_AGENT = agentName || name` en settings de claude; es lo que el agente usa para `hermad send` (`src/commands/send.js:7`, `src/lib/memory.js:20`).
- `src/lib/daemon.js:166` `personaOf(agentName, personas)` — mapea nombre vivo → persona. Reconoce exacto (`personas[agentName]`) y sufijo `-\d+` (`dev-1` → `dev`). Cualquier alias nuevo debe sobrevivir esto.
- `src/lib/project.js:56` — `label`/`name` de `.hermad/project.json` disponible en `bootstrap` (via `{...project}`).
- `src/lib/daemon.js:32-35 / 46-49` — `loadState`/`saveState` en `.hermad/state.json`; hoy guarda `workspaceId`, `daemonPaneId`, `stories`, `markers`, `screens`, `compact`. **No hay campo de alias** persona→nombre.

**Current behavior** — el nombre del agente en herdr ES la clave de persona. `herdr agent list` es global al server (`src/lib/herdr.js:151-159`); si otro workspace ya tiene `orquestador`, `agent start` falla `agent_name_taken`. `startAgentSafe` lo ignora y sigue, dejando el proyecto sin ese agente; `plan-devs` loguea y sigue sin dropear.

**Call paths that hit it (todos pasan por `herdr.agentStart`)**
1. `orchestrator.bootstrap` → `startAgentSafe("orquestador"/worker)` (`orchestrator.js:44,64`) ← `start-team.js:14`, `open-orchestrator.js:13`, `orchestrate.js:18`.
2. `commands/spawn.run` → `startAgentSafe` (`spawn.js:68`).
3. `commands/plan-devs.run` → `herdr.agentStart` directo (`plan-devs.js:135`, NO usa startAgentSafe; tiene su propio catch en `:141`).

**Consumers que resuelven persona→nombre y se romperían con un alias nuevo**
- `daemon.runOnce` `personaOf` (`daemon.js:219`) — decide qué agentes del workspace procesar (buzón, marcadores, compact).
- `daemon.resolveTarget` (`daemon.js:118`) — BUG → `stories[story].dev` (nombre vivo `dev-N`).
- `daemon.nextPending(projectDir, agent.name)` (`daemon.js:228`) — el buzón es `<peer>` = nombre vivo (`daemon.send` `daemon.js:52-53`).
- `hermad send <peer>` (`send.js:11`) — `to` = nombre vivo.
- Briefing (`orchestrator.js:82`) lista `orquestador <workers>` con nombres crudos.
- `plan-devs` (`plan-devs.js:15` `allocateDevs`) evita pisar devs por nombre.
- Prompts templates hardcodean `hermad send orquestador` (`templates/prompts/reader.md:35`, `orquestador.md`, `dev.md:14`, etc.) y `command/*.md:22`.

**Impact** — alias `<proyecto>-<persona>` debe: (a) registrarse (state.json) para `send`/daemon/briefing/plan-devs; (b) ser aceptado por `personaOf`; (c) herdr tiene `agent rename` (ver "herdr CLI" abajo) — alternativa a fallar.

**Tests** — `test/herdr.test.js:6` (agentList filtra sin nombre); `test/daemon.test.js:81` (dev-1→dev), `:134` (dev dueño), `:198` (name null). `startAgentSafe`/colisión **sin test**.

---

## Item 2 — Auto-close agents that finished (daemon)

**Files / functions**
- `src/lib/daemon.js:210` `runOnce(project, io)` — ciclo de poll. **Único lugar** que ve `agent.agent_status` + `agent.agent_status==="idle"/"done"` (`:227`) y ya conoce `state`/buzón. Candidato natural al choke point.
- `src/lib/daemon.js:68` `pendingFiles` / `:81` `nextPending` — pendientes en `.hermad/inbox/<peer>/` (excluye `done/`).
- `src/lib/daemon.js:288` `loop` — setInterval 5s; `runOnce` ya es idempotente por `state`.
- `src/lib/daemon.js:96` `parseMarkers` — detecta `HERMAD:DONE` en pantalla. `processMarkers` (`:178`) solo dispara ruta; **no guarda** que el agente "ya terminó" más allá del conteo por texto de marcador.
- Pane del agente: `daemon.agentList()` vuelve `pane_id` (`herdr.js:156`) — disponible para cerrar.
- herdr: `pane close <pane_id>` y `agent rename` existen (ver abajo), pero `herdr.js` **no expone** `paneClose`/`tabRename`/`agentRename` hoy.

**Current behavior** — ningún cierre. Los agentes quedan vivos e idle. `state.screens/markers` evitan re-disparar rutas, pero no cierran nada. `NATIVE_COMPACT`/watchdog (`daemon.js:254`) tampoco.

**Reglas del pedido** — cerrar solo si: emitió `HERMAD:DONE` **y** `idle`; nunca orquestador; nunca con pendientes en buzón; idempotente (state.json); tolerar fallo de herdr.

**Tests a reusar** — `test/daemon.test.js`: `:57` (entrega buzón + DONE), `:73` (no entrega blocked), `:152` (no se pierde si prompt falla), `:198` (name null), `:211` (fallo de un agente no tumba el tick), `:233` (ignora otro workspace). io stub = `agentList/agentRead/agentPrompt/send/log` (`:23-38`) — habría que agregar `paneClose`/`agentRead` de DONE y `state`.

---

## Item 3 — Every new agent goes to its department tab (`placement.paneForAgent`)

**Files / functions**
- `src/lib/placement.js:70` `paneForAgent(project, persona, io)` — **choke point pedido**. Hoy: `departmentFor` (`:5`) → si no hay departamento `return null` (log `:76`). Si el tab no existe y hay `tabCreate` → crea y devuelve root (`:88-98`). Si `daemonPaneId` falta → `return null` (`:100`). Luego `paneSplit` + `moveToDepartment` (`:25`).
- `src/lib/placement.js:5` `departmentFor` — recorre `project.departamentos`; **reader no está** en `DEFAULT_DEPARTAMENTOS` (`personas-env.js:3-8`: producto[architect,pm,analyst], desarrollo[dev], qa[reviewer], diseno[ux]). En este repo sí está en `project.json:47-55` (producto incluye reader), pero no por default.
- `src/lib/placement.js:14` `gridPlacement` — grilla 4×2.
- Callers de `paneForAgent`:
  - `src/commands/spawn.js:50` — `hermad spawn` (persona cualquiera).
  - `src/commands/plan-devs.js:115` — devs (`personaForAgent(project,"dev",...)`).
- Callers que **NO** pasan por placement: `orchestrator.bootstrap` arma su propio grid a mano (`orchestrator.js:47-67`): tabs por `departamentos` y panes en serie; el orquestador va al root pane (`:44`), no por placement.

**Current behavior / caminos que caen al tab default**
- `reader` sin departamento → `paneForAgent` null → `spawn.js:62` exit 1 (no cae al default, pero **falla**).
- `--kind` alternativo (`hermad spawn dev --kind opencode`): `name = "dev-opencode"` pero `paneForAgent` recibe `persona` (=`"dev"`, `spawn.js:50`), así que **sí** ubica por persona. OK.
- `plan-devs` dev-N: usa `persona="dev"` explícito → OK.
- Persona fuera de `departamentos` en el tab default: hoy `bootstrap` solo arranca personas listadas en `departamentos`; las demás no se dropean ahí. Pero `spawn` sin departamento falla (arriba).
- `open-orchestrator` on-demand: `paneForAgent` crea el tab (`:88-98`) — OK.

**Pedido** — default por persona: `reader`→producto, `dev-N`→desarrollo; nunca tab default. Choke point único = `paneForAgent` (y que `bootstrap` también lo use, o replique la misma asignación).

**Tests** — `test/placement.test.js`: `:8` (departmentFor, incluye `reader → null` hodierno), `:86` (tab existente), `:109` (crea tab on-demand), `:127` (sin departamento → null), `:138` (sin workspace).

---

## Item 4 — Orchestrator tab named `gerencia` (not `1`)

**Files / functions**
- `src/lib/herdr.js:45` `workspaceCreate(cwd, label)` → `herdr workspace create --cwd --label --no-focus`. No renombra tab.
- `src/lib/orchestrator.js:21` — llama `workspaceCreate`; el root pane vive en el tab default que herdr autogenera (hoy aparece como `1` / tab raíz).
- `src/lib/orchestrator.js:48` — `herdr.tabCreate(workspaceId, projectDir, tabLabel)` crea tabs de departamento con `--label`. El orquestador **no** recibe tab propio; queda en el root.
- `src/lib/herdr.js:62` `tabList`, `:50` `tabCreate` — expuestos. **No hay `tabRename`** en `herdr.js` (herdr sí lo tiene, ver abajo).
- `open-orchestrator.js:13` — mismo `bootstrap` con `onlyOrchestrator`.

**Current behavior** — el tab del orquestador es el root/default. Renombrarlo a `gerencia` requiere `herdr tab rename <TAB_ID> <LABEL>`; `herdr.js` no lo wrappea. `tabList` devuelve objetos con `tab_id`/`label` (`herdr.js:65`), usados en `placement.js:33,82`.

**Tests** — sin cobertura de workspace/labels; `test/herdr.test.js` solo cubre `agentList`.

---

## Item 5 — Smart skills (per-task + global always-on)

### 5.0 Cómo `skills.js` construye allowlists por vendor (base)

**Resolución de nombres** (`src/lib/skills.js`)
- `:12` `globalRoots()` — escanea `~/.claude/skills`, `~/.config/opencode/skills`, `~/.agents/skills`, `~/.hermes/skills` (+subtrees), `~/.hermes/profiles/*/skills`, y el cache de plugins claude `~/.claude/plugins/cache/<mp>/<plugin>/<ver>/skills` (marcando `plugin` para el namespace).
- `:41` `projectRoots(projectDir)` — `.claude/skills`, `.opencode/skills`, `.agents/skills` del proyecto.
- `:58` `skillMeta` — parsea `SKILL.md` frontmatter (`description` o 1.ª línea).
- `:68` `listInstalled(projectDir)` — global + proyecto, dedup por `display` (`plugin:name` o `name`).
- `:86` `resolve(name, projectDir)` — soporta `"<plugin>:<skill>"` y nombre plano; busca en order proyecto→global.
- `:114` `resolveAll(names, projectDir)` → `{found, missing}`.
- `:127` `listProjectClaude(...dirs)` — skills de `.claude/skills` del proyecto (para deny de claude).

**Consumo por vendor** (`src/lib/render.js:54` `renderPersona`)
- `:80` `skills.resolveAll(p.skills, sourceDir)`; `missing` → warning, no aborta (`:81-85`).
- **claude** (`render.js:87-119`): plugin por persona `.hermad/generated/claude/<name>/skills/` con symlink/copy de cada skill (`linkSkill :19`); `plugin.json`; `settings.json` con `env.HERMAD_AGENT`, `permissions.deny = ["Agent","Task", ...listProjectClaude→Skill(n)]` y (si readonly) `Edit/Write/...` (`:115-117`). `vendors.startPlan` claude (`vendors.js:110-122`) pasa `--setting-sources project,local --plugin-dir --append-system-prompt-file --settings`.
- **opencode** (`render.js:121-135`): agente md `.opencode/agents/hermad-<name>.md` con `permission.skill = {"*":"deny", <skill>:"allow",...}`; model; readonly→`permission.edit=deny`; cuerpo = prompt+journal. `startPlan` opencode `--agent hermad-<name>` (`vendors.js:124-127`).
- **hermes** (`vendors.js:129-135`): `--skills <found.join(",")>` + `promptText` fallback. **No hay profile/SOUL aquí** (el diseño S1 lo dejó documentado; el código actual usa `--skills`).
- **default** codex/gemini (`vendors.js:137-139`): sin allowlist, `promptText` fallback.
- `artifacts.skillsFound` (nombres) es lo que consume hermes/default (`vendors.js:107`).

### 5a — skills por tarea (híbrido)

**Files / functions**
- `templates/prompts/*.md` frontmatter `skills: [a,b]` (`prompts.js:9` parseFrontmatter; `:36` loadPersona).
- `render.js:54` acepta `persona` (project personas) y `p.skills` (template). Hoy la allowlist sale del **template**, no de la tarea.
- `spawn.js` **no** acepta `--skills` hoy; `vendors.startPlan(kind, persona, persona, artifacts)` (`spawn.js:68`).
- `send.js` — no adjunta rutas de `SKILL.md`; solo texto (`send.js:12,23`).
- `herdr.agentPrompt` (`herdr.js:125`) — mensaje vivo vía `herdr agent prompt`.
- Matcher: **no existe** `hermad skills match`; `commands/skills.js` solo implementa `suggest`.

**Current behavior** — skills fijas por persona (template), horneadas al spawn. Agente vivo no puede recibir skills nuevas salvo re-spawn. Para "agente nuevo --skills a,b" habría que: (1) aceptar `--skills` en `spawn`; (2) fusionar con `p.skills` antes de `renderPersona`; (3) `skills.resolveAll` ya resuelve. Para "agente vivo": `send --skills` adjuntaría las rutas (`skills.resolve(nombre).dir` + `/SKILL.md`) al texto del buzón.

**Tests** — `test/render.test.js:49` (deny project skills), `:39` (bypass por vendor); `test/suggest.test.js:12` (prompt de suggest solo ofrece instaladas).

### 5b — global skills always-on

**Files / functions**
- Config global: `src/lib/config.js:6` `CONFIG_DIR=~/.hermad`, `:11` `DEFAULT_PERSONAS`. **No hay** `globalSkills`.
- Override por proyecto: `.hermad/project.json` (`project.js:48` `hydrate`; `settings-project.js:23` `full`). **No hay** `globalSkills`.
- `hermad skills` (`commands/skills.js:46`) — hoy **solo** `suggest`; sin `list`/`match`/`global add|rm`. HELP (`cli.js:19`) solo menciona `skills suggest`.
- `skills.listInstalled` (`skills.js:68`) ya sirve para listar.

**Current behavior** — no existe el concepto. Para 5b: agregar `globalSkills` a config global + `project.globalSkills` override; sumarlas a `p.skills` en `renderPersona` (o en `spawn`/`plan-devs` antes de `resolveAll`) para que claude/opencode/hermes las horneéen igual.

**Tests** — sin cobertura (ni `config` ni `project.hydrate` cubren globalSkills).

### `hermad skills suggest` — cómo funciona hoy (pedido explícito)

`src/commands/skills.js`
- `:46` `run(args)` — exige `args[0]==="suggest"` y `args[1]` persona.
- `:52` `resolveProject()`; `:58` `skills.listInstalled(project.projectDir)`; aborta si vacío (`:59-62`).
- `:64` `prompts.loadPersona(personaName)` → `current = p.skills`; `body = p.body` o `project.personas[persona].rol`.
- `:67` `buildSuggestPrompt({personaName, body, current, installed})` (`:10`) — arma lista `- <display>: <description>`, pide JSON `{skills:[...], reason}` de 2-6.
- `:38` `callVendor(kind, model, prompt)` — `opencode run <prompt>` / `hermes -z <prompt>` / `claude -p <prompt>`; usa el vendor/modelo del **orquestador** (`:69-70`).
- `:80` `parseSuggestions` (regex `{...}` + JSON).
- `:86-92` imprime propuesta/add/remove y frontmatter sugerido. **No aplica** (solo propone). No hay `--global`, no hay `match`, no hay cache/índice.

**Tests** — `test/suggest.test.js:6` (parseSuggestions), `:12` (buildSuggestPrompt solo instaladas). `callVendor`/`run` sin test (usa CLI real).

**UX pedida** — `hermad skills list` (usar `listInstalled`), `match "<tarea>" [--persona]` (prefiltro keywords sobre índice `name+description` cacheado → top-N al LLM), `suggest --global`, `global add|rm`; HELP en `cli.js:19`.

---

## herdr CLI — capacidades verificadas (`herdr` 0.9.x, sin cambios de código)

- **Renombrar tab**: `herdr tab rename <TAB_ID> <LABEL>...` ✔ (`herdr tab --help` → `rename  Rename a tab`). Necesario para Item 4 (`gerencia`). `herdr.js` no lo expone hoy → agregar wrapper `tabRename(tabId, label)`.
- **Renombrar agente**: `herdr agent rename <TARGET> <NAME>|--clear` ✔ (`herdr agent --help`). Alternativa a `agent_name_taken` (Item 1); hoy `herdr.js` no lo expone.
- **Cerrar pane**: `herdr pane close <pane_id>` ✔ (`herdr pane --help` → `close  Close a pane`). Necesario para Item 2; `herdr.js` no lo expone. El `pane_id` ya viene en `agentList` (`herdr.js:156`).
- **Cerrar tab**: `herdr tab close <tab_id>` ✔.
- `herdr --skill` imprime el skill de herdr; no es un flag de renombre. No hay `herdr pane-agent` remove; el cierre es `pane close`.
- Nota: `agent list` es **global al server** (`herdr.js:151`), por eso el alias/cierre debe filtrar por `workspace_id` (ya lo hace `daemon.js:218`).

---

## Unknowns / risks (solo lo que muestra el código)

- `startAgentSafe` (`orchestrator.js:98`) es solo para bootstrap/spawn; `plan-devs` no lo usa (`plan-devs.js:135`) → cualquier manejo de colisión debe aplicarse en **ambos** caminos o unificar.
- `personaOf` (`daemon.js:166`) solo entiende nombre exacto o `-\d+`. Un alias `<proyecto>-<persona>` (p.ej. `hermad-orquestador`) **no** mapea hoy; rompería rutas/buzón/compact del daemon.
- `state.json` no tiene campo de alias; hay que agregarlo sin romper `loadState` (`daemon.js:35-45` ya rellena defaults por clave).
- Cerrar panes requiere que `runOnce` distinga "DONE emitido" de "DONE visto una vez": hoy `processMarkers` guarda el conteo pero no un flag de cierre; el orquestador (`orquestador`) nunca debe cerrarse (`daemon.js:129` ya lo trata como destino).
- `reader` no está en `DEFAULT_DEPARTAMENTOS` (`personas-env.js:3`); `paneForAgent` devuelve null y `spawn` aborta (`spawn.js:62`). El default `reader→producto` debe ir en la asignación, no solo en el template.
- hermes hoy usa `--skills` (no profile/SOUL) (`vendors.js:129`); docs/vendors.md describe profile pero el código no lo implementa → 5a/5b para hermes dependen de mantener `--skills`.
- Sin grafo de graphify: `graphify update .` (sin costo de API) acelera los próximos mapas. (graph.json existe pero manifest con hashes vacíos; verifiqué con `graphify query` + lectura directa.)
