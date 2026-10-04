# Mejoras 2026-10 — diseño (architect)

Fuente: `docs/mejoras-2026-10.md` (decisiones de Diego, cerradas). Esto solo dice **cómo**.
Principio: cero dependencias nuevas, io inyectable como `placement.js`/`daemon.js`, un choke point por regla.

## 0. Decisiones transversales

- **D0 · Nombre lógico vs nombre vivo.** Todo hermad (buzón, rutas, `state.stories[].dev`, prompts, `--from`) habla en
  **nombre lógico** (`architect`, `dev-2`, `reviewer-opencode`). Solo las llamadas a herdr usan el **nombre vivo**
  (`hermad-architect` si chocó). La traducción vive en un único módulo nuevo: `src/lib/agents.js`.
  → El buzón `.hermad/inbox/<lógico>/` no cambia, `hermad send architect` no cambia y `routes` no cambia.
- **D0b · Artefactos por agente, no por persona.** Hoy `render` escribe en `.hermad/generated/claude/<persona>/`.
  Con skills por tarea, dos agentes de la misma persona (`architect` y `architect-2 --skills x`) se pisarían el plugin
  **en caliente** (claude lee el `SKILL.md` cuando la skill se invoca, no al arrancar). Se pasa a clave `agentName`:
  `generated/claude/<agent>/`, `generated/claude/<agent>.settings.json`, `generated/prompts/<agent>.md`,
  `.opencode/agents/hermad-<agent>.md`. El template de la persona sigue siendo `templates/prompts/<persona>.md`.
- **D0c · Escrituras a `state.json`.** Hoy el daemon hace load→(llamadas lentas a herdr)→save en cada tick, y pisa lo
  que `spawn`/`plan-devs` escriban en el medio. Con el mapa de agentes esto deja de ser teórico. Solución boring:
  `daemon.updateState(projectDir, fn)` = lockfile `state.lock` (O_EXCL, reintento ~2 s, se considera stale a los 10 s)
  + re-read + `fn(state)` + escritura atómica (tmp + rename). El daemon acumula sus cambios durante el tick y los aplica
  al final como un parche sobre una lectura fresca, sin escribir la copia que leyó al principio.
  Dueños de las claves: CLI → `workspaceId`, `daemonPaneId`, `agents[*]` (alta), `stories`; daemon → `screens`,
  `markers`, `rebounds`, `compact`, `agents[*].{doneAt,lastDeliveredAt}`, `agents[*]` (baja al cerrar), `closed`.

## 1. Alias cuando el nombre está tomado

**Módulo** `src/lib/agents.js` (nuevo, io inyectable `{ agentList, agentStart, loadState, updateState }`):

- `liveName(project, logical)` → `state.agents[logical]?.live ?? logical`.
- `logicalOf(project, live)` → busca en `state.agents` por `.live`; si no está, devuelve `live` (agentes legacy).
- `start(project, { logical, persona, kind, paneId, plan })` → **único** camino de arranque (reemplaza a
  `orchestrator.startAgentSafe` y al `agentStart` a mano de `plan-devs`). Hace:
  1. `agent list`: si `logical` ya está vivo **en nuestro workspace** → `[=] ya vivo`, devuelve ese nombre (comportamiento actual).
  2. Si `logical` está tomado en **otro** workspace → `alias = <slug(project.name)>-<logical>` (directo, sin intentar).
  3. `agentStart(nombre)`. Si viene `agent_name_taken` (carrera) y todavía no se probó el alias → reintenta una vez con el alias.
     Si el alias también está tomado → error explícito con los dos nombres. No se agregan sufijos numéricos.
  4. `updateState`: `agents[logical] = { live, persona, kind, paneId, workspaceId, skills, startedAt }`.
  5. Inyecta `plan.promptText` (fallback de vendors) usando `live`. Devuelve `live`.
- `slug(name)`: `[a-z0-9-]`, minúsculas. Si `name` falta, se usa el basename de `projectDir`.
- Descartado: `herdr agent rename`. Renombrar el agente del **otro** proyecto le rompería su daemon, y renombrar el
  nuestro después de arrancarlo no gana nada frente a arrancarlo directamente con el alias.

**Consumidores** (todos resuelven con `liveName`/`logicalOf`, ninguno arma nombres):
- `orchestrator.bootstrap`: usa `agents.start`, y el briefing usa el nombre vivo del orquestador en `agentPrompt`.
  El roster del briefing lista `lógico→vivo` cuando difieren.
- `daemon.runOnce`: por cada agente vivo de `agent list`, `logical = logicalOf(agent.name)` y de ahí
  `personaOf(logical)`, `nextPending(logical)`, `markers[logical]`; `agentPrompt`/`agentRead` siguen usando `agent.name`.
  Prune: una entrada de `state.agents` cuyo `live` no aparece en la lista durante 3 ticks se borra (pane muerto a mano).
- `hermad send`: sin cambios (escribe al buzón lógico). Si alguien escribe el alias (`hermad send hermad-architect`), se normaliza con `logicalOf`.
- `plan-devs`: `allocateDevs` sigue trabajando con nombres lógicos `dev-N`, y el arranque pasa por `agents.start`.
- **Nuevo** `hermad agents [--json]`: tabla `lógico · vivo · persona · kind · pane · estado`. Los prompts y el briefing
  dicen: *"para usar `herdr agent wait/read` con un peer, resolvé su nombre con `hermad agents`"*.
- `HERMAD_AGENT` (settings de claude) = nombre **lógico**, porque `--from` y el journal hablan lógico.

## 2. Auto-close de agentes terminados

En `daemon.runOnce`, después de entregar el buzón y procesar marcadores, `maybeClose(agent)`:

- **Señal DONE**: cuando `processMarkers` aplica un `DONE` emitido por ese agente → `agents[logical].doneAt = now`.
  Cuando una entrega del buzón sale bien → `agents[logical].lastDeliveredAt = now`.
- **Cierra** (`herdr pane close <pane_id>`, `pane_id` sale de `agent list`) si se cumplen todas:
  1. `logical !== "orquestador"` (y tampoco ningún agente con `persona === "orquestador"`).
  2. `agent_status === "idle"` en **2 ticks seguidos**, para no cortar un idle transitorio.
  3. `doneAt > (lastDeliveredAt ?? 0)`: el DONE es posterior a la última tarea que le entregamos.
  4. Buzón vacío (`pendingFiles(logical).length === 0`).
  5. **Guardia de story (refinamiento, no reabre la decisión):** si el agente es dueño de una story
     (`state.stories[*].dev === logical`), solo cierra con `status === "done"`, o sea después del DONE del reviewer.
     Sin esto un `BUG` del reviewer volvería a un dev-N ya cerrado.
- **Al cerrar**: `closed[logical] = { at, live, paneId }`, borra `agents[logical]`, log `[-] cerré <logical>`.
  Idempotente: si `pane close` falla con not-found/unknown → igual se marca cerrado. Ante cualquier otro error,
  log una vez y se reintenta en el próximo tick. Nunca tira el tick.
- **Mensaje a un agente cerrado**: si aparece algo en el buzón de un lógico que está en `closed`, el daemon le avisa
  **una vez** al orquestador (`<logical> está cerrado y tiene N mensajes — hermad spawn <persona> [--name <logical>]`).
  Cuando el agente se vuelve a lanzar con ese nombre lógico, recibe el buzón pendiente como siempre.
- `project.autoClose` (default `true`): un interruptor para apagar la función entera. No hay excepciones por persona.

## 3. Todo agente nuevo cae en el tab de su departamento

Choke point: `placement.paneForAgent` (ya lo usan `spawn` y `plan-devs`; `bootstrap` arma los tabs explícitamente).

- `departmentFor(project, persona)` pasa a resolver en este orden:
  1. `project.departamentos`.
  2. `DEFAULT_DEPARTAMENTOS` de `personas-env.js` (fuente única, se agrega `reader` a `producto`):
     `reader|analyst|architect|pm → producto`, `dev → desarrollo`, `reviewer → qa`, `ux → diseno`.
  3. `project.defaultDepartment`.
  4. El primer departamento de `project.departamentos` que no sea `gerencia`.

  Se normaliza la persona antes de buscar (`dev-3 → dev`, `reviewer-opencode → reviewer`). Nunca devuelve `null` si hay departamentos.
- **Garantía fuerte**: hoy `moveToDepartment` deja el pane "junto al daemon" si falla el move, o sea en el tab default.
  Ahora, si los dos intentos de move fallan, se hace `pane close` del pane temporal y se devuelve `null`. El caller
  aborta con un mensaje claro. **O el agente aterriza en su tab, o no arranca.** `--pane <id>` en `spawn` sigue
  existiendo como escape explícito.
- `gerencia` queda reservado: si `departamentos` lo trae como etiqueta de workers, se avisa y se ignora esa entrada.

## 4. Tab del orquestador = `gerencia`

- `herdr.tabRename(tabId, label)` (nuevo wrapper sobre `herdr tab rename <TAB_ID> <LABEL>`).
- `bootstrap`, justo después de `workspaceCreate`: `tabList(workspaceId)[0]` (el único tab que existe en ese momento)
  → `tabRename(id, MANAGEMENT_TAB)`, con `MANAGEMENT_TAB = "gerencia"` exportado por `placement`. Es best-effort: si falla, log y sigue.
  `open-orchestrator` pasa por `bootstrap`, así que queda cubierto.

## 5a. Skills por tarea (modelo híbrido)

**Índice + matcher**, en un módulo nuevo `src/lib/skills-index.js`:

- `build({ refresh })` → `[{ id, name, description, dir, source }]`, donde `id` = `display` de `listInstalled`
  (`plugin:skill` o plano) y `source` ∈ `claude|claude-plugin|opencode|agents|hermes|project`. Cache del índice en
  `~/.hermad/cache/skills-index.json`:
  ```json
  { "version": 1, "builtAt": "2026-10-04T…", "fingerprint": "<sha1>", "skills": [ { "id": "superpowers:tdd", "name": "tdd", "description": "…", "dir": "/…/skills/tdd", "source": "claude-plugin" } ] }
  ```
  `fingerprint` = sha1 de `(root, mtimeMs, nº de hijos)` de cada root de `globalRoots()`. Se recalcula si cambia el
  fingerprint, si pasaron más de 24 h, o con `--refresh` (editar la `description` de un `SKILL.md` no cambia el mtime del root).
  Las roots del proyecto se escanean en vivo (son pocas) y se mergean encima.
- `match(query, { persona, top = 15 })`: el puntaje es un BM25-lite local, sin embeddings ni red. Tokens en minúscula,
  sin acentos y sin stopwords es/en. Campos con peso: `name ×3`, `description ×1`. Boost `+` si la skill está en el
  frontmatter de la persona. Las `globalSkills` se excluyen porque ya están cargadas. Devuelve el top-N, y quien
  decide la lista final es el orquestador (el LLM).

**Entrega**:
- `hermad spawn <persona> --skills a,b` → `render.renderPersona({ …, extraSkills })`.
  Allowlist efectiva = `frontmatter ∪ globalSkills efectivas ∪ --skills`, deduplicada. Se hornea por vendor como hoy
  (tabla en §6). Lo que el vendor no puede cargar de forma nativa va como **lista de rutas `SKILL.md` en el prompt del
  agente** (bloque `## Task skills — read these SKILL.md before starting`). Las skills de la tarea quedan registradas
  en `state.agents[logical].skills`.
- `hermad send <peer> "…" --skills a,b` → se resuelve cada skill con `skills.resolve` y se agrega al mensaje del buzón
  el mismo bloque de rutas absolutas. Una skill que no existe → warning y se omite. El daemon entrega el archivo como
  siempre (el texto multilínea por `agent prompt` ya funciona hoy).
- El agente lee el `SKILL.md` con su herramienta de lectura. Esto no depende del tool `Skill`, así que funciona con
  el deny de skills de claude y con el reader readonly.

## 5b. Skills globales

- **Global**: `~/.hermad/config.json` → `"globalSkills": ["hermad", "herdr-bmad", "caveman", …]`.
  ⚠ `config.load()` hoy descarta todo lo que no sea `personas`, así que un `save()` borraría `globalSkills`.
  Hay que preservar las claves desconocidas.
- **Proyecto**: `.hermad/project.json` → `"globalSkills": { "add": [...], "remove": [...] }`.
- **Efectivas** = `(global ∪ add) − remove`, calculadas por `skills.effectiveGlobals(project)`. Se suman en todo
  spawn/bootstrap/plan-devs dentro de `render.renderPersona`, el único lugar donde se arma la allowlist.
- `hermad skills suggest --global`: le pasa el índice al LLM del orquestador con la consigna "skills de uso general,
  no de dominio", muestra la propuesta y pide confirmación interactiva (`prompt.js`, y/N). Solo escribe en
  `~/.hermad/config.json` si Diego confirma; `--yes` no existe a propósito.

## CLI (superficie final)

```
hermad agents [--json]                                   # lógico → vivo, persona, kind, pane, estado
hermad spawn <persona> [--name X] [--pane ID] [--kind V] [--model ID] [--skills a,b]
hermad send <peer> "<msg>" [--from X] [--skills a,b]
hermad skills list [--source S] [--json] [--refresh]     # índice cacheado
hermad skills match "<tarea>" [--persona P] [--top N] [--json]
hermad skills suggest <persona> | --global               # propone; --global confirma y escribe
hermad skills global [list]                              # efectivas, marcando el origen (global/proyecto)
hermad skills global add|rm <s…> [--project]             # sin --project → ~/.hermad; con --project → add/remove del proyecto
```
`skills global add` valida con `skills.resolve`: un nombre que no existe se rechaza, salvo con `--force`.

## 6. Matriz de vendor: carga de skills

| Vendor | Agente nuevo (`spawn --skills`, globales) | Agente vivo (`send --skills`) |
|---|---|---|
| **claude** | symlink en el plugin del agente `generated/claude/<agent>/skills/` (namespace `hermad-<agent>:`); `--setting-sources project,local` oculta las de usuario. Nativo para cualquier fuente, incluidas las de plugins. | **No recarga en caliente** (`docs/vendors.md`) → rutas `SKILL.md` en el mensaje, leídas con Read. |
| **opencode** | `permission.skill: allow` en `hermad-<agent>.md`. Solo carga las de sus roots (`~/.config/opencode/skills`, `.opencode/skills`, `.agents/skills`, `~/.claude/skills`). Las de un plugin de claude (`plugin:skill`) o de hermes van como rutas en el prompt del agente. | Rutas en el mensaje. Releer el agente md en caliente no está verificado, así que no se usa. |
| **hermes** | `--skills a,b` con las que estén en sus roots (`~/.hermes/skills/**`, profiles); el resto va como rutas en el `promptText` inicial. | Rutas en el mensaje. |
| **codex / gemini** | Fallback: rutas en el `promptText` inicial. | Rutas en el mensaje. |

Regla única en el código: `render` parte las skills en `native` (el vendor las ve) y `byPath` (bloque de rutas
agregado al prompt), según `source` del índice y `kind`. Así ningún vendor se queda sin una skill pedida.

## Límites de los módulos (quién toca qué)

| Módulo | Cambio |
|---|---|
| `lib/agents.js` (nuevo) | alias, arranque único, resolución lógico↔vivo |
| `lib/daemon.js` | `updateState` con lock + rename, resolución con `logicalOf`, `maybeClose`, aviso por buzón de agente cerrado, prune |
| `lib/placement.js` | fallback a `DEFAULT_DEPARTAMENTOS`, normalización de persona, `MANAGEMENT_TAB`, fallo fuerte (close + null) |
| `lib/personas-env.js` | `reader` en `producto` dentro de `DEFAULT_DEPARTAMENTOS` |
| `lib/herdr.js` | `tabRename`, `paneClose` |
| `lib/orchestrator.js` | rename a `gerencia`, `agents.start`, briefing con nombres vivos; `startAgentSafe` → wrapper deprecado de `agents.start` |
| `lib/render.js` | artefactos por `agentName`, `extraSkills`, globales, split `native`/`byPath` |
| `lib/skills.js` | `effectiveGlobals`; `listInstalled` expone `source` |
| `lib/skills-index.js` (nuevo) | cache + `match` |
| `lib/config.js` | preserva las claves desconocidas (`globalSkills`) |
| `commands/{spawn,send,skills,plan-devs}.js`, `commands/agents.js` (nuevo) | superficie de CLI de arriba |
| `templates/prompts/*`, `command/*.md` | "resolvé nombres con `hermad agents`"; el orquestador usa `skills match` antes de spawnear |

Paralelismo para `plan-devs`, por solape de archivos: (A) `agents.js` + `daemon.js` [§1, §2, D0c] ·
(B) `placement.js` + `herdr.js` + `orchestrator.js` [§3, §4] · (C) `skills-index.js` + `skills.js` + `config.js` +
`commands/skills.js` [§5 índice/global] · (D) `render.js` + `spawn`/`send` [§5 entrega, D0b]. B depende de A
(`orchestrator` usa `agents.start`), D de C.

## Tests (`node --test`, con io stub como `test/daemon.test.js:23-38`)

- `agents`: nombre libre → plano; tomado en otro workspace → alias; vivo en el nuestro → se reusa; carrera
  `agent_name_taken` → alias; alias tomado → error. `logicalOf`/`liveName` con y sin entrada.
- `daemon`: entrega y marcadores con un agente que tiene alias; `maybeClose` cierra solo si se cumplen las 5
  condiciones (un caso por cada condición negada); `pane close` not-found → marcado cerrado; aviso único por buzón de
  agente cerrado; prune; `updateState` no pisa una clave escrita entre el load y el save.
- `placement`: `reader → producto` sin `departamentos`; `dev-3 → desarrollo`; si el move falla → pane cerrado y `null`.
  Se actualiza `test/placement.test.js:8`, que hoy espera `reader → null`.
- `skills-index`: el cache se invalida cuando cambia el fingerprint; ranking de `match`; las globales quedan excluidas.
  `effectiveGlobals` con add/remove. `config` preserva `globalSkills`.
- `render`: artefactos en `<agent>`; split `native`/`byPath` por vendor; `extraSkills` y globales en la allowlist.

## Riesgos

1. **Carrera en `state.json`** (D0c). Sin el lock, el auto-close y el alias se pierden en silencio. Es lo primero que hay que construir.
2. **Cerrar a destiempo.** El agente recibió trabajo por fuera del buzón (`herdr agent prompt` directo del orquestador)
   después de su DONE. Mitigación: la condición 3 más el idle doble. Riesgo residual: la regla del orquestador pasa a
   ser "siempre `hermad send`, nunca `agent prompt` a un worker" (va al template).
3. **Daemon sin `workspaceId`** (state viejo). Hoy el filtro por workspace se saltea y podría tratar al `orquestador`
   de otro proyecto como propio, incluso cerrarlo. Mitigación: `maybeClose` exige que el agente esté en `state.agents`
   **y** que coincida el `workspace_id`. Si falta cualquiera de los dos, no cierra nunca.
4. **Cerrar el último pane de un tab** puede cerrar el tab entero. No pasa nada: `paneForAgent` lo vuelve a crear (camino `tabCreate`).
5. **Dedupe de DONE**: depende de `n=<seq>`. Un DONE repetido sin `n` no vuelve a disparar el cierre del siguiente
   ciclo; queda abierto (falla segura, no destructiva).
6. **Índice desactualizado**: si se edita una `description` en el lugar, el fingerprint no lo detecta. Lo cubren el TTL de 24 h y `--refresh`.
7. **Ruido del matcher con ~300 skills**: el keyword match va a traer falsos positivos. El top-N es amplio (15) a
   propósito y filtra el LLM. No se agregan embeddings hasta que haya evidencia de que hacen falta.
8. **Colisión de nombres de skill** (`tdd` plano vs `superpowers:tdd`): el índice y `--skills` usan siempre el `id`
   con namespace cuando existe. `resolve` con un nombre plano ambiguo da warning y lista los candidatos.
9. **opencode/hermes con skills de otro vendor**: entrega por ruta = allowlist blanda (el agente podría ignorarla).
   Es aceptable porque las skills de tarea son una guía, no una frontera de seguridad.

Nada de esto toca auth, dinero, DB ni seguridad: no hace falta aprobación de Diego más allá del gate de build del orquestador.
