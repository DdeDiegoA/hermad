# Hermad para todos — investigación (analyst, 2026-10-04)

Épica "hermad para todos" (track full). Decisiones de Diego ya tomadas y **no reabiertas**: (1) skills = pack base + descubrir, (2) completion zsh/bash/fish/PowerShell solo comandos+flags, (3) TUI = wizard simple. Solo lectura sobre el código; refs `archivo:línea` al estado del repo hoy.

---

## (a) Problema y usuarios

| | Diego hoy | Usuario nuevo |
|---|---|---|
| Instalación | `git clone` + `npm link`, repo propio | `npm i -g hermad` o clone; sin repo de referencia |
| Herramientas | claude + opencode + hermes, herdr, BMad, graphify | Probablemente 1 vendor (claude *o* opencode), a veces herdr aún no instalado |
| Skills | ~30 de `~/.claude/skills`, plugins (`caveman`, `ponytail`, `karpathy`), `_bmad` en el repo | Cero o pocas; ningún plugin de Diego |
| Modelos | `opencode-go/deepseek-v4.1-flash`, `--model opus` | Los que su plan/provider permita |
| Idioma | Español | Desconocido |

**Problema:** hermad funciona porque la máquina de Diego ya tiene todo lo que asume. Un usuario nuevo corre `hermad setup` y obtiene: personas con skills `bmad-*` inexistentes (solo warning, el agente arranca "pelado"), vendors por defecto que quizá no tiene, modelos de un provider ajeno, y ningún asistente que lo guíe. Además no hay completion y el `setup` actual es un `select` numerado repetido 8 veces.

**Éxito (propuesto):** `npm i -g hermad && hermad setup` en una máquina limpia con *un* vendor + herdr deja un proyecto funcional, sin editar JSON a mano.

---

## (b) Auditoría de supuestos del entorno de Diego

Severidad: **A** = rompe/degrada a un usuario nuevo · **M** = molesta · **B** = cosmético.

### Skills (el núcleo del pedido #1)
| Sev | Ubicación | Supuesto |
|---|---|---|
| A | `templates/prompts/{analyst,architect,dev,pm,ux,reviewer,orquestador}.md:3` | Frontmatter `skills: [bmad-agent-*, bmad-build, bmad-spec, bmad-code-review…]`. Solo existen si BMad está instalado en **ese proyecto** (`.claude/skills/`). Sin BMad → warning y persona sin skills. |
| A | `templates/prompts/*.md:15` (cuerpo) | Los prompts *nombran* `bmad-brainstorming`, `bmad-forge-idea`, `bmad-deep-recon`, `bmad-spec` como si estuvieran. Texto fijo, no condicional. |
| A | `templates/prompts/orquestador.md:43` | "clarify with `bmad-spec` or `bmad-brainstorming`" — ídem. |
| A | `~/.hermad/config.json` → `globalSkills` (no está en el repo) | Hoy Diego lo llena a mano (`caveman:caveman`, `ponytail:ponytail`, `andrej-karpathy-skills:karpathy-guidelines`, `graphify`). `config.js:23` default `[]` ✔ pero nada lo puebla en `setup`. |
| M | `src/commands/setup.js:12-19` | `setup` instala `herdr-bmad` + 2 comandos vía symlink en `~/.claude`, `~/.config/opencode`, `~/.hermes`: **sin comprobar** que el vendor esté instalado ni preguntar. Crea `~/.hermes/...` aunque no exista hermes (Windows lo salta, `:50`). |
| M | `src/lib/skills.js:14-26` | Roots de indexado fijos (`~/.claude/skills`, `~/.config/opencode/skills`, `~/.agents/skills`, `~/.hermes/...`, `~/.claude/plugins/cache`). Correcto como *descubrimiento*, pero no cubre codex/gemini y en Windows `~/.config/opencode` puede ser `%APPDATA%` (verificar). |
| M | `skill/SKILL.md` + `command/hermad.md:13`, `command/orchestrate.md:13` | Asumen `_bmad/config.toml` presente. |
| B | `templates/prompts/reader.md:12-16` | Usa graphify; ya degrada bien si falta ("Nothing is blocked") → **patrón a copiar** para el resto. |

### Vendors / modelos
| Sev | Ubicación | Supuesto |
|---|---|---|
| A | `src/lib/config.js:11-20` | `DEFAULT_PERSONAS`: `orquestador` en claude, `analyst/dev/reviewer/ux/reader` en opencode; `architect/pm` en claude. Usuario solo-claude arranca con 5 personas apuntando a un binario que no tiene. `setup` pregunta persona por persona, pero el *default* es incorrecto. |
| A | `.hermad/project.json` (trackeado en este repo) y `skill/scripts/personas.env:12-17` | `opencode-go/deepseek-v4.1-flash`, `kimi-k2.7-code`, `deepseek-v4-pro` — provider de Diego. El `.hermad/` del repo no debe distribuirse como ejemplo. |
| M | `src/lib/vendors.js:20-39` | `STATIC_MODEL_CATALOG` hardcoded (`claude-opus-5`, `gpt-5.1-codex`, `gemini-2.5-*`): envejece. Solo opencode lista dinámico (`:56`). Alias `opus/sonnet/haiku` es lo robusto. |
| M | `src/commands/skills.js:201-206` | `suggest`/LLM usa **la persona orquestador** (kind+modelo) para consultar; si el usuario no tiene ese vendor autenticado, falla (`process.exit(1)`). En setup habría que usar "el primer vendor detectado y operativo". |
| M | `src/lib/vendors.js:94-100` | `BYPASS_ARGS`: todos los agentes corren sin prompts de permisos. Decisión de Diego, pero un usuario nuevo debería **aceptarlo explícitamente** en el wizard (riesgo de seguridad, ver §f). |
| B | `src/lib/vendors.js:6-12` | codex/gemini "solo documentados": nunca probados (AGENTS.md F0). Marcar experimental. |

### Herramientas externas
| Sev | Ubicación | Supuesto |
|---|---|---|
| A | `src/lib/herdr.js:8-18` | Si falta herdr, error con 1 línea de install. `setup` **no** lo chequea ni ofrece instalarlo; recién falla en `start-team`. Install differs por OS (brew / `install.sh` / `install.ps1`). |
| A | `src/commands/create-project.js:19-21,73` | BMad instalado por `npx -y bmad-method@latest ... --communication-language Spanish --document-output-language Spanish` → **idioma fijo español**; `script -q /tmp/b.log` (path fijo `/tmp`, requiere `script`/`stty`, no portable a Alpine/BSD); `--tools claude-code,opencode` fijo (ignora los vendors reales). Es opt-in (`--run-bmad-install`), pero la ayuda lo presenta como el camino. |
| M | `src/commands/create-project.js:15,56` y `settings-project.js:13` | Escribe `~/.hermad/personas.env` "activo" solo para `orquestar.sh` (bash de referencia que `hermad` ya no usa). Estado global huérfano. |
| M | `src/lib/orchestrator.js:108` + `templates/prompts/{reviewer,architect,dev}.md`, `templates/AGENTS-template.md:26` | Texto "notify **Diego**" / "escala a Diego" en prompts y plantilla que se copian a proyectos ajenos. Debe ser "the user" / configurable. |
| M | `templates/AGENTS-template.md` y prompts | Español/inglés mezclados; el idioma de documentos no sigue el del usuario. |
| M | `src/commands/update.js:10-21` | Solo `git pull --ff-only` en `REPO_ROOT`: inútil si se instaló por npm (no hay `.git`), y rompe si el usuario tocó el clone. |
| B | `package.json` | `version 0.2.0`, sin `files`, sin `repository`; `npm publish` hoy empaquetaría `graphify-out/`, `_bmad/`, `research/`, etc. Remote `git@github.com:DdeDiegoA/hermad.git` (SSH: un tercero no puede clonar con esa URL). |

### Estado del proyecto del usuario
| Sev | Ubicación | Supuesto |
|---|---|---|
| M | `src/lib/render.js:154,225` | `.gitignore` y `deny Skill(...)` asumen `.claude/skills/` de BMad del proyecto; ya es tolerante (lista lo que halla). |
| M | `src/lib/project.js` (resolveProject) | Fallback al "proyecto activo global" (`~/.hermad/active-project.json`): en máquinas con varios proyectos puede abrir el equivocado (ya avisa). |

**Lo que ya está bien (no tocar):** rutas vía `os.homedir()`/`path.join` (no hay `/Users/diego…` hardcodeado en `src/`), soporte Windows (junction/copy, `where`, `shell: true`), CI en 3 OS (`.github/workflows/test.yml`), degradación de skills inexistentes (warning), `config.save` merge que preserva claves.

### Qué es el "pack base" (propuesta del analyst)
Lo que hermad **necesita para funcionar**, versionado en el repo y copiado/linkeado por `setup` (no depende de nada del usuario):
1. skill `herdr-bmad` (`skill/`) — ya.
2. comandos `/hermad` y `/hermad:orchestrate` (`command/`) — ya.
3. **Nuevo:** versión *genérica* de cada persona que no dependa de BMad: el prompt trae el método embebido (spec → stories → build → review) y las skills `bmad-*` pasan a ser **opcionales/enriquecedoras** ("si existen, usá…"). Es el cambio de mayor impacto para usuarios sin BMad.
4. Todo lo demás (globales como caveman/ponytail/karpathy/graphify, bmad-*) = **descubierto**, nunca enviado.

Hay una decisión abierta de producto: ¿hermad instala BMad por el usuario (hoy opt-in) o funciona sin? Ver §f-1.

---

## (c) Completion: cómo lo resuelven otros CLIs

**Patrón dominante: subcomando que emite el script a stdout** + el usuario lo "sourcea" o lo guarda en el directorio estándar del shell.

| CLI | Mecanismo | Instalación |
|---|---|---|
| `gh` | `gh completion -s zsh\|bash\|fish\|powershell` (cobra) | zsh: `> $fpath/_gh`; fish: `> ~/.config/fish/completions/gh.fish`; PS: `Invoke-Expression (gh completion -s powershell \| Out-String)` en `$PROFILE` |
| cobra (kubectl, hugo, docker…) | `<cli> completion bash\|zsh\|fish\|powershell [--no-descriptions]`; el script llama de vuelta a `<cli> __complete <args>` | idem; los paquetes (Homebrew) lo instalan solos |
| `npm` | `npm completion >> ~/.bashrc` (bash/zsh) — sin fish/PowerShell | append manual |
| `@bomb.sh/tab` (lib JS, Bombshell/clack; lo usa Wrangler desde 2026-01) | genera scripts zsh/bash/fish/powershell que invocan `<cli> complete -- <args>` | `<cli> complete <shell>` + source |
| `tabtab` | instala en rc del usuario, 2.5 MB + `inquirer` viejo | abandonado (2023) — descartado |
| `omelette` | bash/zsh/fish, sin PowerShell, sin mantenimiento (2023) | descartado |

### Opciones para hermad
- **A. Scripts estáticos generados por nosotros (recomendada).** El set es chico y estable: ~16 subcomandos + flags conocidos (`src/cli.js:3-26` ya los lista). Una tabla `COMMANDS = {cmd: {flags, sub}}` única → 4 generadores de ~30 líneas cada uno (plantillas de texto). **0 dependencias.** Sin proceso Node por TAB (rápido: Node ≈ 40–100 ms de arranque, perceptible en cada TAB).
  - Limitación asumida: no completa *valores dinámicos* (personas, skills). Diego dijo "solo comandos y flags" → coincide. Futuro: opcional `hermad __complete` para personas.
- **B. Dinámica estilo cobra (`hermad __complete`).** Más potente (valores), pero cada TAB lanza Node, y exige mantener el parser de la línea de comandos por shell. YAGNI hoy.
- **C. `@bomb.sh/tab`.** Cubre los 4 shells, 74 KB, activa, pero es **ESM-only** (hermad es CJS) y pre-1.0 (`0.0.x`) → riesgo de API. No compensa para 16 comandos.

### Mecanismo de instalación propuesto
```
hermad completion <zsh|bash|fish|powershell>   # imprime el script a stdout (como gh)
hermad completion install [--shell X]          # detecta shell ($SHELL / $PSModulePath) y lo instala
hermad completion uninstall
```
Rutas de `install` (idempotente, nunca duplica líneas):

| Shell | Destino | Extra |
|---|---|---|
| zsh | `~/.zfunc/_hermad` (o `$fpath[1]`) | asegurar `fpath+=~/.zfunc; autoload -U compinit && compinit` en `~/.zshrc` (bloque marcado `# >>> hermad >>>`) |
| bash | `~/.local/share/bash-completion/completions/hermad` (bash-completion v2 lo autocarga) | fallback: `source` en `~/.bashrc` (macOS bash 3.2 sin bash-completion → fallback obligatorio) |
| fish | `~/.config/fish/completions/hermad.fish` | fish lo autocarga, nada más |
| PowerShell | línea `hermad completion powershell \| Out-String \| Invoke-Expression` en `$PROFILE` (crear si no existe) | Windows PowerShell 5.1 y pwsh 7: perfiles distintos; ExecutionPolicy puede bloquear el profile |

Reglas: el wizard **ofrece** instalar completion (paso final de `setup`), no lo hace en silencio; `install` siempre muestra qué archivo tocará; un test verifica que la tabla `COMMANDS` coincide con el `switch` de `cli.js` (si no, el completion queda desactualizado: es la falla típica).

Pruebas: zsh/bash/fish en CI Linux; PowerShell en el runner Windows ya existente. `compgen`/`complete -C` permiten tests de unidad para bash sin TTY.

---

## (d) Wizard: comparación de librerías

Alcance acordado: prompts guiados (select, confirm, multiselect, text, spinner, note) para `setup`, `update`, install; sin pantallas persistentes. Hoy: `src/lib/prompt.js` (26 líneas, `readline`, selector numerado). Regla actual: "zero new dependencies" (`package.json` sin deps, `package-lock` vacío).

Tamaños = `dist.unpackedSize` en npm (2026-10-04); deps = directas.

| Opción | Tamaño | Deps directas | Módulo | Node mín. | Mantenimiento | Windows | Notas |
|---|---|---|---|---|---|---|---|
| **`readline` (actual, mejorado)** | 0 | 0 | stdlib | 18 ✔ | n/a | ✔ (ya probado) | Numérico; multiselect = "1,3,5"; sin flechas. Se puede mejorar con `readline/promises` + colores ANSI + `--yes`/no-TTY fallback. |
| **`@clack/prompts` 1.8** | 94 KB (+ core 56 KB) | 4 (`@clack/core`, `sisteransi`, `fast-wrap-ansi`, `fast-string-width`) | **ESM-only** | **≥ 20.12** | Muy activo (modificado 2026-09), Bombshell/Astro | ✔ | Mejor UX/estética (intro/outro/spinner/note/multiselect/cancel). Es lo que usa el instalador de BMad. Incompatible con `engines >=18` y con CJS sin `import()`/`require(esm)` (Node ≥ 22). |
| `@inquirer/prompts` 8.7 | 25 KB + ~10 paquetes | 10 sub-paquetes | ESM | ≥ 20.17 / 22.13 | Activo | ✔ | Más pesado en árbol; sin intro/spinner (usar `ora`). |
| `inquirer` 14.2 | 60 KB | 6 | ESM | alto | Activo | ✔ | Redundante con `@inquirer/prompts`. |
| `enquirer` 2.4 | 189 KB | 2 (`ansi-colors`, `strip-ansi`) | **CJS** | ≥ 8.6 | Sin releases desde 2023-07 | ✔ | Encaja en CJS, pero sin mantenimiento. |
| `prompts` 2.4 | 187 KB | 2 | CJS | — | Sin releases desde 2023-10 | ✔ | Ídem. |

### Recomendación
**Mantener cero dependencias hoy y subir `lib/prompt.js` a un wizard "suficientemente bueno" con `readline` + ANSI** (confirm, select, multiselect por números, spinner de texto, `--yes`, detección de no-TTY). Argumentos:
1. El wizard es *one-shot* (setup/update); una vez por máquina. El valor marginal de flechas es bajo vs. el costo de romper `engines >=18` y CJS.
2. Hermad se instala a veces por `git clone` + `npm link`: con deps hay que correr `npm install` en el clone y que `hermad update` (git pull) también lo haga → complica el camino de distribución que hoy es trivial.
3. Cada dependencia es superficie de supply-chain en una herramienta que ejecuta agentes con permisos bypass.

**Plan B (si Diego prioriza UX): `@clack/prompts`**, cargado con `import()` dinámico **solo dentro de `setup`/`update`** (el resto del CLI sigue sin deps), `engines >=20.12`, con fallback a readline si falta o no hay TTY. Requiere pasar a publicar por npm (deps instaladas) y subir el mínimo de Node. No recomiendo `enquirer`/`prompts` (sin mantenimiento) ni inquirer (árbol grande).

Decisión para Diego: ver §f-3.

### Flujos mínimos del wizard (insumo para ux)
1. **Instalar/setup:** detectar OS + Node → detectar herdr (ofrecer comando de install según OS, no ejecutarlo sin "sí") → detectar vendors (`which`) → elegir vendor+modelo por persona (default inteligente: todo al único vendor disponible; alias `opus/sonnet/haiku`) → **descubrir skills** (índice) → proponer `globalSkills` y skills por persona (`skills suggest`, multiselect con todo desmarcado por defecto salvo coincidencias fuertes) → confirmar `bypass permissions` → instalar pack base (symlinks solo en vendors detectados) → ofrecer completion.
2. **update:** detectar método de instalación (npm / git) → mostrar versión actual vs. nueva → confirmar → actualizar → re-linkear pack base (el `setup` parcial).
3. **create-project:** nombre, ¿instalar BMad?, idioma de documentos (hoy forzado a español).

---

## (e) Distribución, instalación y update

### Hoy
- `README.md`: `git clone <repo> ~/hermad && npm link`. Remote es SSH privado (`git@github.com:DdeDiegoA/hermad.git`).
- `hermad update` = `git pull --ff-only` (`src/commands/update.js:10-21`); aborta si no hay `.git`.
- `setup` crea symlinks **hacia el clone** → mover/borrar el clone rompe skills y comandos; en Windows archivos se copian (quedan desactualizados tras update — avisa).
- `package.json` sin `files`/`repository`/`publishConfig`; sin releases/tags; `engines node >=18`; CI en 3 OS.

### Opciones propuestas
| Canal | Cómo | Pros | Contras |
|---|---|---|---|
| **npm (recomendado primario)** | `npm i -g hermad` (publicar con `files: ["bin","src","skill","command","templates"]`) | 1 comando, Windows/macOS/Linux, `npm update -g`, versionado semver, sin git | Symlinks apuntan dentro de `node_modules` global → cambia de ruta en cada update ⇒ `postupdate`/`setup --relink` obligatorio; hay que reservar el nombre `hermad` y publicar |
| npx | `npx hermad setup` | cero instalación para probar | symlinks a cache efímera ⇒ **no** sirve para `setup` persistente; solo para el primer wizard que luego instala global |
| git clone + `hermad update` | actual | dev/contribuidores | pide SSH/permiso; dos pasos |
| Homebrew tap | `brew install <user>/hermad/hermad` | natural para usuarios de herdr (`brew install herdr` ya es el camino en macOS) y trae completions gratis (`generate_completions_from_executable`) | Mantener fórmula/tap; solo macOS/Linux; depende de `node` formula; ROI bajo hasta tener usuarios |
| Script `curl \| sh` / `irm \| iex` | como herdr | un paso, instala Node+hermad | seguridad percibida, mantenimiento de 2 scripts; **no ahora** |

**Propuesta:** (1) publicar en npm + `hermad update` que detecta el método (`npm root -g` contiene REPO_ROOT → `npm i -g hermad@latest`; `.git` → `git pull`); (2) tras cualquier update, re-ejecutar el paso "link pack base" idempotente; (3) Homebrew tap = fase posterior; (4) para Windows ya existe el fallback copy. Alternativa a symlinks (copiar el pack base a `~/.hermad/pack/` y linkear desde ahí) estabiliza las rutas ante cambios de ubicación de `node_modules` → **recomendado** para evitar symlinks colgantes.

Versionado: semver + tag + `hermad --version`; `update` compara con `npm view hermad version` (o `git ls-remote --tags`) y avisa, sin pegar red en cada comando.

---

## (f) Riesgos y preguntas abiertas para Diego

**Preguntas (necesitan decisión):**
1. **BMad:** ¿hermad debe funcionar *sin* BMad (prompts autosuficientes, bmad-* opcionales) o ofrecer instalarlo en el wizard? Mi recomendación: ambas — funcionar sin, y ofrecer instalar como paso opcional con elección de idioma.
2. **Publicación:** ¿repo público + npm (`hermad` o scoped `@ddediegoa/hermad`)? Sin esto, "cualquier usuario" no es posible (remote SSH hoy). Necesita cuenta/permiso npm (**dinero/identidad → decisión tuya**).
3. **Wizard:** ¿readline mejorado, 0 deps (rec.) o `@clack/prompts` (mejor UX, sube Node ≥ 20.12 y exige `npm install`)? La regla "zero deps" se mantiene o se enmienda explícitamente.
4. **Idioma:** prompts internos mezclan ES/EN; los de usuario nuevo ¿ES, EN o elegible? (afecta `--communication-language` de BMad y los textos del wizard).
5. **Permission bypass por defecto** (`BYPASS_ARGS`, `vendors.js:94`): ¿el wizard debe pedir aceptación explícita y permitir "modo con prompts"? Hoy es siempre bypass. Es una decisión de **seguridad** → escalada.
6. **codex/gemini:** ¿soportados oficialmente o "experimental"? Nunca se probaron en vivo.
7. **Defaults por vendor:** si el usuario tiene un solo vendor, ¿asignamos todas las personas a él (rec.) o preguntamos persona por persona (hoy)?

**Riesgos:**
- *Symlinks hacia el clone/`node_modules`* se rompen al mover/actualizar → mitigar con pack en `~/.hermad/pack/` + re-link idempotente.
- *Windows:* hermes no corre nativo; herdr en beta; symlink de archivos pide modo desarrollador (hay fallback copy); PowerShell ExecutionPolicy puede bloquear `$PROFILE`.
- *Completion desactualizada* si la tabla de comandos diverge del `switch` → test de paridad.
- *Descubrir skills* indexa `~/.claude/plugins/cache` y similares: puede leer miles de archivos y exponer contenido de skills privadas al LLM de `suggest` → **pedir consentimiento** antes de mandar descripciones al vendor.
- *`suggest` falla sin vendor autenticado* → el wizard debe hacer fallback a `skills match` local (BM25) sin LLM.
- *Supply-chain / seguridad de agentes con bypass* en máquinas de terceros → documentar, y que el wizard lo diga claramente.
- *Deuda vigente que afecta a terceros* (AGENTS.md, pendientes post-épica): auto-close cierra agentes `spawn` antes de aprobación del reviewer; `normalizePersona` corta en el primer `-`. Conviene resolverlas antes de abrir a usuarios.
- *Cobertura real de pruebas ajenas a Diego:* hasta ahora todo se verificó en una sola máquina (macOS). Falta una prueba "máquina limpia" (contenedor Linux / VM Windows) como criterio de aceptación de la épica.

**Criterios de aceptación sugeridos para el PM:** (1) en entorno limpio con un solo vendor, `hermad setup` → `create-project` → `start-team` funciona sin errores ni warnings de skills; (2) `grep -r "/Users/\|Diego\|opencode-go\|deepseek" src templates command skill` = 0 coincidencias (salvo docs); (3) TAB completa los 16 subcomandos y sus flags en 4 shells; (4) `hermad update` funciona por npm y por git; (5) todos los pasos del wizard tienen modo `--yes` / no-TTY.

---

### Fuentes
- gh completion: https://man.cx/gh-completion(1) · cobra completions: https://code.apps.glenux.net/glenux-archive/spf13--cobra/raw/tag/v1.7.0/shell_completions.md
- @bomb.sh/tab: https://github.com/bombshell-dev/tab · Wrangler tab completion: https://developers.cloudflare.com/changelog/2026-01-09-wrangler-tab-completion
- herdr install: https://herdr.dev (install.sh / install.ps1 / `brew install herdr`), resumen en https://www.bitdoze.com/herdr-agent-multiplexer/
- Tamaños, deps y engines: `npm view` (2026-10-04).
