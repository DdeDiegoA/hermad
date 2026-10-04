# Diseño — Hermad para todos (v0.3)

Autor: architect (Winston) · 2026-10-04 · Fuentes: `docs/hermad-para-todos-{research,brief,prd}.md`, `AGENTS.md`, código en `main` (bd744c9).
Las decisiones de Diego **no se reabren**. Esto solo fija límites de módulos, datos y orden de construcción.

Principio: **reusar lo que ya existe** (`skills-index.js`, `config.save` con merge, io inyectable, `agents.js`, `state.stories`). Una sola dependencia nueva (`@clack/prompts`), cargada solo en el wizard.

---

## 0. Mapa de módulos

| Módulo | Estado | Responsabilidad |
|---|---|---|
| `src/lib/commands-table.js` | **nuevo** | Tabla única `COMMANDS` (comando → resumen, subcomandos, flags, handler). Fuente de `HELP`, dispatch y completion |
| `src/cli.js` | refactor | Dispatch desde la tabla (sin `switch`); `HELP` generado |
| `src/lib/config.js` | extender | Schema nuevo (§3, §4), defaults sin vendor, migración legacy |
| `src/lib/detect.js` | **nuevo** | Prereqs: versión de Node, `herdr`, vendors, comando de instalación de herdr por OS. Puro, io inyectable |
| `src/lib/install-method.js` | **nuevo** | `detect()` → `git` \| `npm-global` \| `unknown`; `currentVersion()` / `availableVersion()` |
| `src/lib/pack.js` | **nuevo** | Copia el pack a `~/.hermad/pack` (swap atómico) + relink idempotente hacia vendors detectados |
| `src/lib/discovery.js` | **nuevo** | Sugerencia de `globalSkills` y skills por persona: LLM con consentimiento → fallback BM25 local. Devuelve datos, nunca `exit` |
| `src/lib/bmad.js` | **nuevo** | Arma el comando de instalación de BMad (idioma, `--tools` según vendors, log en `os.tmpdir()`) |
| `src/lib/i18n.js` + `src/i18n/{es,en}.js` | **nuevo** | `t(key)` para textos del wizard y del completion install. Resto del CLI sin tocar |
| `src/wizard/ui.js` | **nuevo** | Adaptador de UI: `clack` (TTY) \| `headless` (`--yes`/no-TTY) \| `readline` (si clack no carga) |
| `src/wizard/steps/*.js` | **nuevo** | Un archivo por paso; cada paso `collect(ctx, ui)` sin escribir disco |
| `src/lib/completion/{zsh,bash,fish,powershell}.js` + `install.js` | **nuevo** | Generadores de texto desde `COMMANDS` + instalación en rc con bloque marcado |
| `src/commands/completion.js` | **nuevo** | `hermad completion <shell>` / `install` / `uninstall` |
| `src/commands/setup.js` | reescritura | Orquesta los pasos del wizard; `collect → resumen → apply` |
| `src/commands/update.js` | reescritura | Por método de instalación + relink del pack |
| `src/commands/skills.js` | refactor | `suggest` usa `discovery.js`; el `process.exit` queda solo en el borde CLI |
| `src/lib/vendors.js` | extender | `startPlan` aplica `BYPASS_ARGS` **solo** si `permissions === "bypass"`; marca `experimental` |
| `src/lib/render.js` | extender | Resuelve `permissions`, placeholders `{{user}}`/idioma, `optionalSkills` silenciosas |
| `src/lib/placement.js` | fix | `basePersona()` reemplaza a `normalizePersona` |
| `src/commands/spawn.js` | extender | `--story <id>` |
| `templates/`, `command/`, `skill/` | reescritura de texto | Autosuficientes, sin "Diego", sin `opencode-go` |

---

## 1. Pack base + descubrimiento de skills (T1/T2)

### 1.1 Pack (`src/lib/pack.js`)

Contenido = lo que hermad necesita para funcionar, nada del usuario: `skill/` (herdr-bmad, **sin** `skill/scripts/personas.env`) y `command/{hermad,orchestrate}.md`.

```
~/.hermad/pack/
  manifest.json      { version, installedAt, links: [{ path, target, mode: "symlink"|"junction"|"copy" }] }
  skill/             copia de <repo>/skill
  command/hermad.md
  command/orchestrate.md
```

- `install({ vendors, io })`: copia a `~/.hermad/pack.tmp-<pid>`, luego `rename` sobre `~/.hermad/pack` (borra el viejo después). Cancelar a mitad deja el pack anterior intacto (FR-3.6).
- `relink({ vendors, io })`: misma tabla de destinos que hoy `SYMLINKS` en `setup.js`, pero `target` = `~/.hermad/pack/...` y **filtrada por vendor detectado** (no crea `~/.hermes` si no hay hermes). Reglas por destino:
  - no existe → crear (symlink/junction; en Windows archivo → copia, como hoy).
  - es symlink a `~/.hermad/pack/...` → `=`, nada.
  - es symlink a otro lugar **que termina en un path del repo hermad** (`/skill`, `/command/hermad.md`, …: instalación vieja apuntando al clone) → reemplazar. Esto migra a Diego sin pasos manuales.
  - es copia registrada en `manifest.links` → sobrescribir (las copias de Windows dejan de quedar viejas).
  - cualquier otra cosa → dejar intacto + aviso (comportamiento actual).
- Idempotente (A9): correr dos veces produce 0 cambios. `plan()` devuelve la lista de acciones sin ejecutar → la usa el resumen del wizard.

### 1.2 Resolución de skills (`src/lib/skills.js`, extender)

Frontmatter de personas se parte en dos:

```yaml
skills: []                                  # requeridas → si faltan: warning (FR-1.3, igual que hoy)
optionalSkills: [bmad-agent-dev, bmad-build] # enriquecimiento → si faltan: silencio (FR-1.2)
```

Allowlist efectiva por persona = `skills` ∪ `optionalSkills presentes` ∪ `config.globalSkills` ∪ `config.personaSkills[persona]` ∪ `project.skills.add` − `project.skills.remove`. Solo cambia el origen de dos conjuntos; el render por vendor (plugin claude, `permission.skill` opencode, `--skills` hermes) no se toca.

### 1.3 Descubrimiento (`src/lib/discovery.js`)

```js
suggest({ index, personas, vendor, consent, io }) → {
  source: "llm" | "local",
  global:   [{ name, score?, reason? }],
  byPersona:{ <persona>: [{ name, score?, reason? }] },
  warnings: [string]
}
```

- `index` = `skills-index.js` existente (cacheado, `--refresh`). Roots: los de hoy; en Windows agregar `%APPDATA%\opencode\skills` si existe.
- **LLM** solo si `consent === true` y hay `vendor` (el que el usuario eligió para el orquestador en el paso de vendors, no el de la config vieja). Se manda: nombre + `description` del frontmatter de cada skill, nunca el cuerpo. Si `callVendor` lanza → cae a local y agrega `warnings`. Sin `process.exit` (FR-2.3).
- **Local**: BM25 (`skills match` actual) del cuerpo de cada persona contra el índice → por persona top-5 con score ≥ umbral (constante en el módulo, preseleccionadas). Globales en local: lista instalada **sin preselección**.
- Persistencia (solo tras confirmación): `config.globalSkills`, `config.personaSkills`. Nada de la máquina de Diego viaja como default.
- `--yes`: modo local salvo `--llm-suggest` explícito (privacidad por defecto, NFR-5).

---

## 2. Prompts autosuficientes + BMad opcional (T1)

- **Plantillas** (`templates/prompts/*.md`, siguen en inglés): la sección "Your BMad skill/workflow" se reemplaza por **"Method"** embebido (clarify → spec → stories → build → review, adaptado a la persona) + una línea "If `bmad-<x>` is available, use it for step N". Patrón: `reader.md` ("Nothing is blocked if missing").
- **Placeholders** que resuelve `render.js` al renderizar por proyecto:
  - `{{user}}` → `config.userName || "the user"` (FR-1.5; reemplaza todos los "Diego").
  - `{{language}}` → `English`/`Spanish` desde `config.language`; se agrega una línea fija "Communicate with {{user}} and write documents in {{language}}." Los prompts siguen en inglés (FR-3.5).
- `templates/AGENTS-template.md`: mismos placeholders, renderizado por `create-project`. `src/lib/orchestrator.js:108`, `command/*.md`, `skill/SKILL.md`: texto estático "the user"; referencias a `_bmad/config.toml` pasan a "if present".
- `skill/scripts/personas.env`: sin modelos (`opencode-go/*` fuera). Si nadie lo lee, se borra (verificar que solo lo use `orquestar.sh` de referencia).
- **BMad opcional** (`src/lib/bmad.js`): `installCommand({ language, vendors, platform, tmpdir })` →
  `npx -y bmad-method@latest install --yes --directory . --modules bmm --tools <claude-code|opencode según vendors> --communication-language <L> --document-output-language <L>`, envuelto en `script -q <tmpdir>/hermad-bmad.log …` en Unix (como hoy, sin `/tmp` fijo). Si `script` no existe → correr directo y avisar.
  - `setup` guarda la preferencia `config.bmad.autoInstall` (bool). `create-project` instala si `--run-bmad-install` o la preferencia; si instala, agrega `bmad-help` a `project.skills.add`.
- **Test de portabilidad** (A2): `test/portability.test.js` = el `grep` de NFR-1 sobre `src templates command skill` → 0.

---

## 3. Vendors, modelo y idioma (T4/T3)

**Datos** (`~/.hermad/config.json`, todo opcional; `load()` rellena defaults, `save()` sigue mergeando):

```json
{
  "schemaVersion": 2,
  "language": "es" | "en",
  "userName": "",
  "permissions": { "mode": "bypass" | "prompt", "acceptedAt": "<iso>|null" },
  "personas": { "<p>": { "kind": "claude", "modelFlag": "--model sonnet", "rol": "..." } },
  "globalSkills": [],
  "personaSkills": { "<p>": [] },
  "bmad": { "autoInstall": false }
}
```

- `DEFAULT_PERSONAS` conserva solo `rol`; `kind`/`modelFlag` vacíos (FR-4.5). `create-project`/`start-team` con una persona sin `kind` → error claro "corré `hermad setup`".
- **Detección** (`detect.js`): reusa `vendors.detectInstalledVendors()`. 1 vendor → todas las personas a él sin preguntar (FR-4.1). Varios → propuesta: orquestador/architect/pm al primero de `[claude, opencode, hermes]` presente, el resto al segundo; el usuario confirma o edita (FR-4.2). `codex`/`gemini` llevan `experimental: true` en `VENDOR_BINARIES` y nunca son default (FR-4.4).
- **Modelo**: siempre elegido. Lista = `modelsFor(kind)` (dinámico en opencode, alias en claude). Se pregunta **una vez por vendor** con opción "distinto por persona". hermes → texto libre, vacío válido (FR-4.3). En `--yes`: `--model <id>` aplica a todas; sin él → `modelFlag: ""` (rige el default **del propio vendor del usuario**; hermad no elige nada).
- **Idioma**: primer paso del wizard; default = `LANG`/`Intl` que empiece con `es` → `es`, si no `en`; `--lang` lo fuerza. Gobierna `t()` del wizard, `{{language}}` de los prompts y el idioma de BMad.
- **Migración legacy**: config sin `schemaVersion` y con `personas` → se respeta tal cual (Diego no pierde nada), se escribe `schemaVersion: 2` al próximo `save`.

---

## 4. Permisos — ⚠️ PARTE CON GATE DE SEGURIDAD (aprobación orquestador/Diego antes del build)

- **Dato**: `config.permissions.mode`; override opcional por proyecto `project.json → permissions` (**`project.hydrate` debe preservarlo**: ya perdió claves antes).
- **Resolución única**: `render.renderPersona` resuelve `mode = project.permissions ?? config.permissions.mode ?? "prompt"` y lo devuelve en `artifacts.permissions`. Ojo: `orchestrator.js:60,84` y `plan-devs.js:121` llaman a `renderPersona` **sin** `project` → render lee `.hermad/project.json` de `sourceDir || projectDir` cuando no viene (test para los 4 callers). `vendors.startPlan` agrega `BYPASS_ARGS[kind]` solo si `artifacts.permissions === "bypass"`. Así start-team, spawn, plan-devs y orchestrator heredan sin tocar sus archivos (FR-5.3).
- **Modo prompt** = sin flag de bypass (claude modo default, opencode sin `--auto`, hermes sin `--yolo`). Los deny explícitos (reader readonly, allowlist de skills) aplican en ambos modos.
- **Aceptación**: el paso del wizard muestra el texto de riesgo (lo escribe ux) y exige confirmación explícita; guarda `acceptedAt`. **`--yes` NUNCA implica bypass**: en headless el modo es `prompt` salvo `--accept-bypass` explícito.
- **Cambio posterior** (FR-5.4): `hermad settings permissions [bypass|prompt]`; pasar a `bypass` pide la misma confirmación (o `--accept-bypass`).
- **Legacy** (propuesta a aprobar): config existente sin `permissions` → `bypass` (status quo de Diego, sin regresión) + aviso de una línea en `start-team` hasta que se fije explícitamente. Config nueva → `prompt` hasta aceptar.
- Riesgo operativo del modo prompt: los agentes quedan `blocked` esperando permiso; el daemon ya no entrega a `blocked`, pero el humano tiene que atender los panes. El texto de ux debe decirlo.

---

## 5. Completion (T6)

- **Tabla única** `src/lib/commands-table.js`:
  ```js
  { name: "spawn", summary: "...", flags: ["--name","--pane","--kind","--model","--skills","--story"], sub: [], run: () => require("./commands/spawn") }
  ```
  `sub` admite anidado (`skills list|match|suggest|global add|rm`, `settings agents|project|permissions`, `completion zsh|bash|fish|powershell|install|uninstall`, `memory slice`). `cli.js` despacha con `COMMANDS.find(c => c.name === cmd)`; `HELP` se genera desde `summary`.
- **Generadores** (`src/lib/completion/<shell>.js`): `generate(COMMANDS) → string`, plantillas de texto de ~30 líneas, sin Node en cada TAB. bash compatible con 3.2 (sin `compopt`, sin arrays asociativos).
- **Install** (`completion/install.js`): rutas de FR-6.5; bloque `# >>> hermad >>>` … `# <<< hermad <<<` reemplazado in place (nunca duplica, A9); `uninstall` borra bloque + archivo. Siempre `plan()` (muestra archivo y diff) antes de escribir. Shell: `--shell` > `$SHELL` > `$PSModulePath` presente → powershell. PowerShell: perfil de `pwsh` y de 5.1 si existen; si `ExecutionPolicy` es `Restricted`, avisar y no tocar.
- **Test de paridad** (`test/cli-parity.test.js`, FR-6.4): (a) nombres de la tabla == comandos despachados; (b) todo literal `--flag` que lean `src/commands/*.js` está en la tabla del comando (dirección fuente → tabla, así la tabla puede declarar flags futuros); (c) cada generador incluye todos los comandos y flags. CI: zsh/bash/fish en Linux; `pwsh` en Windows carga el script sin error (NFR-4).

---

## 6. Wizard (`@clack/prompts`) (T3)

- **Carga**: `ui.js` hace `await import("@clack/prompts")` (CJS → `import()` dinámico) solo desde `setup`/`update`/`settings permissions`. Si falla (clone sin `npm install`) → adaptador `readline` (el `prompt.js` actual con `confirm`/`multiselect`). `--yes` o `!process.stdin.isTTY` → adaptador `headless`.
- **Interfaz del adaptador** (las 3 implementaciones iguales): `intro, outro, note, select, multiselect, confirm, text, spinner, cancelled(v)`. `headless` devuelve el `default` de cada pregunta; si una pregunta no tiene default → lanza `NeedsInput(key)` → setup aborta con mensaje y el flag que falta (FR-3.3, nunca cuelga).
- **Flujo `setup`** — fase 1 `collect` (no escribe nada) → fase 2 resumen → fase 3 `apply`:

| # | Paso (`src/wizard/steps/`) | Escribe | Default headless |
|---|---|---|---|
| 1 | `language.js` | — | `--lang` o locale |
| 2 | `prereqs.js`: Node ≥ 20.12, herdr, vendors | ejecuta install de herdr **solo** con confirmación | herdr ausente → aviso, sigue; 0 vendors → abort |
| 3 | `vendors.js`: reparto + modelo | — | 1 vendor = todas; varios = propuesta; `--model` |
| 4 | `skills.js`: consentimiento LLM → sugerencias → multiselect | — | local, sin LLM; `--skip-skills` |
| 5 | `permissions.js` ⚠️ | — | `prompt` (bypass solo con `--accept-bypass`) |
| 6 | `bmad.js`: preferencia autoInstall | — | `false` |
| 7 | `summary.js`: lista de archivos/links a tocar + confirm | — | confirmado |
| 8 | apply: `pack.install` + `pack.relink` + `config.save` (tmp + rename) | sí | — |
| 9 | `completion.js`: ofrecer install | rc del shell | **no** instalar (`--completion` para sí) |

  Cancelar (Ctrl-C / `cancelled`) antes del paso 8 → sale sin tocar disco.
- **Flags de setup**: `--yes --lang es|en --model <id> --skip-skills --llm-suggest --accept-bypass --completion --skip-agents` (este último ya existe).
- **No** hay comando `install` ni `postinstall` de npm: instalar = `npm i -g github:…` + `hermad setup`. Cualquier comando sin config válida sugiere `hermad setup`.

---

## 7. Instalación y update (T7)

- `package.json`: `files: ["bin","src","skill","command","templates"]`, `repository: { type: "git", url: "https://github.com/DdeDiegoA/hermad.git" }`, `engines.node: ">=20.12"`, `dependencies: { "@clack/prompts": "<versión exacta pineada>" }` + `package-lock.json` commiteado. CI: `node-version: 22` (20 actual < 20.12).
- `install-method.js`:
  - `git` ⇔ existe `<REPO_ROOT>/.git`.
  - `npm-global` ⇔ `REPO_ROOT` está bajo `npm root -g`.
  - si no → `unknown`.
- `update`:
  - `git` → `git pull --ff-only` + `npm install --omit=dev` (por clack) → `pack.install` + `pack.relink`.
  - `npm-global` → `npm install -g github:DdeDiegoA/hermad` (URL desde `package.json.repository`) → `pack.relink` **corriendo el binario nuevo** (`hermad setup --relink-only`, flag interno), porque el proceso actual es el viejo.
  - `unknown` → mensaje con los dos comandos manuales, exit 0 (FR-7.4).
  - Versión disponible: `fetch` del `package.json` crudo de `main` en GitHub (stdlib, timeout 5 s); si falla → "no pude ver la versión disponible" y pide confirmar igual. Sin red en otros comandos.
- Requisito declarado: instalar desde GitHub necesita `git` en la máquina del usuario (lo verifica `prereqs.js` solo para `update`).

---

## 8. Las dos deudas (T8)

- **`spawn --story <id>`** (FR-8.1/8.2): tras `agents.start`, `daemon.updateState` escribe `state.stories[id] = { dev: <lógico>, branch: <branch del cwd o null>, status: "assigned", source: "spawn" }` — mismo formato que `plan-devs`. Si la story ya está `assigned` a otro → error, no pisa. La guarda de `maybeClose` (`daemon.js:319`) ya mira `state.stories[].dev` → no requiere cambio; se agrega test (A7). El DONE del reviewer la marca `done` por la ruta existente (`daemon.js:231`).
- **`normalizePersona` → `basePersona(name, { project, state })`** (FR-8.3): orden: (1) `state.agents[logical].persona` si está registrado (lo graba `agents.start`); (2) quitar prefijo `<slug(proyecto)>-` (mismo `slug` de `agents.js`, exportarlo); (3) match del **prefijo más largo** contra las keys de `project.personas` (`dev-3` → `dev`, `reviewer-opencode` → `reviewer`); (4) si nada → el nombre tal cual. Test A8.
- De paso (mismo track, archivos propios): aviso de ruta con `branch`/commit del dev (FR-8.4, `daemon.js`) y destinos con espacios en `send.js` (FR-8.5).

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| clack es ESM-only, hermad CJS | `import()` dinámico en `ui.js`; fallback `readline`; nada más del CLI lo importa |
| Clone sin `npm install` → sin clack | Fallback `readline` + `update` corre `npm install --omit=dev` |
| `--yes` usado en scripts activa bypass por accidente | `--yes` nunca implica bypass; requiere `--accept-bypass` |
| Modo prompt: agentes `blocked` y equipo parado | Texto de ux lo explica; daemon ya no entrega a `blocked`; override por proyecto |
| `project.hydrate` descarta `permissions` (pasó con `routes`/`autoClose`) | Test explícito de hydrate en la story de permisos |
| Relink reemplaza un symlink del usuario que no es de hermad | Solo reemplaza targets que terminan en paths del repo hermad o copias del manifest; resto intacto |
| Update npm: el proceso viejo relinkea con código viejo | Relink delegado al binario nuevo (`setup --relink-only`) |
| Tocar `~/.zshrc`/`$PROFILE` del usuario | Bloque marcado, `plan()` visible, `uninstall`, nunca en silencio |
| Paridad de completion se rompe con un comando nuevo | Tabla única + test fuente→tabla en CI |
| CI en Node 20 < 20.12 | Subir a 22 en la story de completion (dueña del workflow) |
| Repo privado | Bloquea solo A1 con tercero real (acción de Diego) |

---

## 10. Qué diseña ux (`docs/hermad-para-todos-ux.md`)

1. Orden final y textos es/en de los 9 pasos de §6 (intro, notas, outro), con estados de error: sin vendors, herdr ausente, Node viejo, clack no carga, LLM falla → local.
2. **Pantalla de permisos** (⚠️ gate): texto del riesgo de bypass, qué significa el modo prompt (agentes bloqueados esperando), cómo cambiarlo después. Va al orquestador/Diego para aprobación junto con §4.
3. **Pantalla de consentimiento LLM**: qué se envía (nombres + descripciones), a qué vendor/modelo, y que "no" usa el matcher local.
4. Paso vendors/modelos: cómo se ve "un vendor → todas" (nota, sin pregunta), el reparto con varios, y "modelo por vendor vs. por persona".
5. Multiselect de skills: agrupación global vs. por persona, preselección, cómo saltear.
6. Resumen pre-apply (lista de archivos/links) y comportamiento ante cancelación.
7. Flujo `update` (versión actual vs. disponible, método detectado, confirm, relink) y `settings permissions`.
8. Tabla `--yes`/no-TTY → default de cada paso (debe coincidir con §6).

---

## 11. Tracks para `plan-devs` (máx 3 devs, `files` sin solape)

| Ola | Story | Files (exclusivos) | depends_on |
|---|---|---|---|
| 1 | **HPT-CLI-TABLE** — tabla única + dispatch + paridad (declara ya todos los comandos/flags finales: `completion`, `settings permissions`, flags de setup/update, `spawn --story`) | `src/lib/commands-table.js`, `src/cli.js`, `test/cli-parity.test.js` | — |
| 1 | **HPT-CONFIG-PERMS** ⚠️ gate seguridad — schema v2, defaults sin vendor, migración legacy, `permissions` en render/startPlan/hydrate, `settings permissions`, `experimental` | `src/lib/config.js`, `src/lib/vendors.js`, `src/lib/render.js`, `src/lib/project.js`, `src/commands/settings-agents.js`, `test/config-v2.test.js`, `test/permissions.test.js` | — |
| 1 | **HPT-DEBTS** — `spawn --story`, `basePersona`, aviso con branch/commit, `send` con espacios | `src/commands/spawn.js`, `src/lib/placement.js`, `src/lib/daemon.js`, `src/commands/send.js`, `src/lib/agents.js` (export `slug`), `test/spawn-story.test.js`, `test/base-persona.test.js` | — |
| 2 | **HPT-COMPLETION** — generadores, install/uninstall, comando, CI Node 22 + pwsh | `src/lib/completion/*`, `src/commands/completion.js`, `.github/workflows/test.yml`, `test/completion*.test.js` | CLI-TABLE |
| 2 | **HPT-PROMPTS** — plantillas autosuficientes, `optionalSkills`, placeholders, sin "Diego", test de portabilidad | `templates/**`, `command/**`, `skill/**`, `src/lib/skills.js`, `src/lib/orchestrator.js`, `src/lib/render.js`, `test/portability.test.js`, `test/optional-skills.test.js` | CONFIG-PERMS (comparte `render.js`, secuencial) |
| 2 | **HPT-WIZARD-CORE** — clack + adaptador UI, i18n, detect, pack, install-method, `package.json` | `package.json`, `package-lock.json`, `src/wizard/ui.js`, `src/lib/i18n.js`, `src/i18n/*`, `src/lib/detect.js`, `src/lib/pack.js`, `src/lib/install-method.js`, `test/pack.test.js`, `test/detect.test.js`, `test/ui-headless.test.js` | CONFIG-PERMS |
| 3 | **HPT-SETUP** — pasos del wizard, discovery, `suggest` sin exit, setup collect/apply; A5 (stdin cerrado) + A9 (idempotencia) | `src/commands/setup.js`, `src/wizard/steps/*`, `src/lib/discovery.js`, `src/commands/skills.js`, `src/lib/prompt.js`, `test/setup-*.test.js`, `test/discovery.test.js` | WIZARD-CORE, COMPLETION, PROMPTS, **doc ux** |
| 3 | **HPT-UPDATE-BMAD** — update por método + relink, `bmad.js`, `create-project` con idioma/tools/tmpdir, README | `src/commands/update.js`, `src/lib/bmad.js`, `src/commands/create-project.js`, `README.md`, `test/update.test.js`, `test/bmad.test.js` | WIZARD-CORE, PROMPTS |

Notas: la ola 1 no tiene solapes. `render.js` pasa de CONFIG-PERMS a PROMPTS en serie. El pm traduce esto a `stories.yaml` con AC por FR y tests `node --test` con io inyectable (sin herdr ni red). **HPT-CONFIG-PERMS y la pantalla de permisos de ux requieren aprobación de Diego antes del build.**
