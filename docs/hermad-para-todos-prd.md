# PRD — Hermad para todos (v0.3)

Fuentes: `docs/hermad-para-todos-research.md` (analyst: auditoría con refs `archivo:línea`, comparativa de wizard/completion, riesgos), `docs/hermad-para-todos-brief.md` (brief), decisiones finales de Diego (buzón `pm`, 2026-10-04T06:17Z) y `AGENTS.md` (pendientes post-épica 2026-10). **Decisiones cerradas: no se reabren.**

Estado: draft · Fase: PM (brief + PRD) · Siguiente: architect (arquitectura) → ux (spec del wizard) → pm (stories).

---

## 1. Usuarios

| Usuario | Quién es | Qué necesita de hermad |
|---|---|---|
| **Nuevo usuario** (primario) | Dev con **un** vendor (`claude` *o* `opencode`), quizá `herdr` no instalado, cero o pocas skills propias, sin BMad | Que `setup` lo guíe, le diga qué le falta, no le pida editar JSON y no le nombre nada que no tenga |
| **Diego** (mantenedor) | Máquina ya armada: 2+ vendors, ~30 skills, plugins, BMad por proyecto | Que su setup siga funcionando igual y deje de ser la única configuración soportada |
| **Contribuidor** | `git clone` + `npm link`, toca código | Tests en 3 OS, sin supuestos ocultos de entorno, sin que su clone se rompa con `update` |
| **Agentes** (consumidores del contrato) | claude/opencode/hermes corriendo por persona | Prompts autosuficientes (no asumen skills que no existen), idioma correcto, rutas y buzón resueltos |

## 2. Problema (dolor, con evidencia)

| # | Dolor | Dónde se ve hoy |
|---|---|---|
| P1 | **Skills fantasma.** Las personas declaran `bmad-*`; sin BMad la persona arranca "pelada" y con warnings. | `templates/prompts/{analyst,architect,dev,pm,ux,reviewer,orquestador}.md:3,15`; `orquestador.md:43` nombra `bmad-spec`/`bmad-brainstorming` como si existieran |
| P2 | **Vendors inexistentes por defecto.** Un usuario solo-claude arranca con 5 personas apuntando a `opencode`. | `src/lib/config.js:11-20` (`DEFAULT_PERSONAS`); `src/commands/setup.js:58-72` pregunta persona por persona con ese default |
| P3 | **Nada puebla `globalSkills`.** El campo existe y está vacío; el descubrimiento no ocurre. | `src/lib/config.js:23` (`globalSkills: []`), `src/commands/setup.js:46-56` (no lo toca) |
| P4 | **`setup` es ciego y verboso.** Crea symlinks en vendors que no están, `~/.hermes` incluido, sin chequear `herdr` ni pedir confirmación; 8 selectores numerados sin flechas. | `src/commands/setup.js:11-20, 46-56, 90-95`; `src/lib/prompt.js:14-24`; `herdr` recién se extraña en `start-team` (`src/lib/herdr.js:7-17`) |
| P5 | **El repo distribuye la máquina de Diego.** Modelos de su provider, `.hermad/` con su config, textos "notify Diego" en plantillas que se copian al proyecto ajeno, idioma de BMad fijo en español. | `src/lib/vendors.js:17-35` + `.hermad/project.json:22-45`; `templates/AGENTS-template.md:26`; `src/lib/orchestrator.js:108`; `src/commands/create-project.js:19-21` |
| P6 | **No hay completion.** 16 subcomandos y flags a memorizar. | `src/cli.js:3-24` (la tabla existe, el completion no) |
| P7 | **`update` solo entiende clones git.** Con instalación por npm no hay `.git` → aborta. | `src/commands/update.js:11-21` |
| P8 | **Dos deudas que le pegan a terceros.** (a) el auto-close cierra un agente lanzado con `spawn` apenas emite DONE, aunque el reviewer no aprobó; (b) `normalizePersona` corta en el primer `-` → un nombre colisionado (`<proyecto>-<persona>`) pierde su departamento. | `src/lib/daemon.js:300-320` (la guarda de story mira solo `state.stories`); `src/lib/placement.js:11-13` |

**Causa raíz común:** hermad nunca tuvo un camino de instalación distinto al de su autor. Cada supuesto de entorno está horneado en el fuente, no preguntado.

## 3. Objetivo y métricas

**Objetivo:** que una máquina limpia con un vendor y `herdr` llegue a un equipo de agentes corriendo, guiada, sin editar JSON y sin warnings.

| Métrica | Nivel esperado | Cómo se verifica |
|---|---|---|
| Pasos manuales entre instalar y `start-team` | 3 comandos, 1 wizard, 0 ediciones de JSON | Aceptación A1 |
| Warnings de skills en un setup con BMad ausente | 0 | Salida de `hermad setup` + `start-team` en entorno limpio |
| Strings del entorno de Diego en el código distribuido | 0 | Aceptación A2 (`grep`) |
| Subcomandos/flags completados por TAB | 16/16 en 4 shells | Aceptación A3 + test de paridad |
| Caminos de instalación que `update` entiende | 2/2 (npm global, clone git) | Aceptación A4 |
| Pasos del wizard con modo no interactivo | 100% | Aceptación A5 |

Sin métricas inventadas de adopción: el producto no tiene usuarios todavía y no hay telemetría (no se agrega).

**Contra-métrica:** que "funcione en limpio" no suba el costo para Diego. Su setup actual (vendors múltiples, skills propias, BMad) debe seguir corriendo sin regresión: `npm test` verde y `hermad setup` en su máquina sin cambios de flujo forzados.

## 4. Alcance por tracks

| Track | Contenido | Fase que lo especifica |
|---|---|---|
| **T1 — Pack base y vida sin BMad** | Pack versionado en `~/.hermad/pack`; personas autosuficientes; `bmad-*` opcionales; BMad ofrecido con elección de idioma | architect + pm |
| **T2 — Descubrimiento de skills** | Indexado del usuario, propuesta de `globalSkills` y por persona, consentimiento LLM, fallback local | architect |
| **T3 — Wizard** | `@clack/prompts`, prereqs, idioma, `--yes`/no-TTY, pasos de setup/update/install | ux (spec) |
| **T4 — Vendors y modelos** | Detección, un vendor → todas las personas, varios → split confirmado, modelo siempre elegido | ux + architect |
| **T5 — Permisos** | Explicación del riesgo de bypass + aceptación explícita; modo prompting si se rechaza | ux + architect |
| **T6 — Completion** | `completion <shell>`, `install`/`uninstall`, 4 shells, test de paridad | architect |
| **T7 — Distribución y update** | Instalación desde GitHub, `files`/`repository`, `update` por método, relink del pack | architect |
| **T8 — Deuda que afecta a terceros** | `spawn --story` + guarda de auto-close; `normalizePersona` vía mapa lógico→vivo | pm (stories) → devs |

---

## 5. Requisitos funcionales

### F1 — Pack base y funcionamiento sin BMad (T1)

- **FR-1.1** `setup` DEBE instalar el pack base (skill `herdr-bmad` + comandos `/hermad` y `/hermad:orchestrate`) copiándolo a `~/.hermad/pack/` y enlazando **desde ahí** hacia los vendors detectados. Los enlaces NO DEBEN apuntar dentro del clone ni de `node_modules` global (se rompen al mover/actualizar).
- **FR-1.2** Las personas DEBEN arrancar y operar **sin BMad instalado**: el prompt trae el método embebido (clarificar → spec → stories → build → review) y las skills `bmad-*` pasan a leerse como enriquecimiento opcional ("si están disponibles, usalas"). Cero warnings cuando faltan.
- **FR-1.3** Cuando una skill declarada no existe, el arranque DEBE seguir con advertencia (comportamiento actual) y nunca abortar.
- **FR-1.4** El wizard DEBE ofrecer instalar BMad como paso **opcional**, con elección de idioma de comunicación y de documentos. `create-project` NO DEBE forzar `Spanish`; el idioma sale de la config elegida en el setup (§F3).
- **FR-1.5** El texto de los prompts y plantillas que se copian al proyecto DEBE referirse a "the user" (o al nombre configurado), nunca a "Diego". Alcanza a `templates/AGENTS-template.md`, `templates/prompts/*.md`, `src/lib/orchestrator.js` y `command/{hermad,orchestrate}.md` (política de escalado incluida). El rol del orquestador/approval policy se mantiene; solo cambia a quién nombra.
- **FR-1.6** `skill/scripts/personas.env` DEBE dejar de traer modelos del provider de Diego (`opencode-go/*`) y NO DEBE distribuirse como ejemplo (`skill/scripts/orquestar.sh` es copia de referencia sin uso por el CLI).

### F2 — Descubrimiento de skills (T2)

- **FR-2.1** `setup` DEBE indexar las skills instaladas del usuario en los roots conocidos (`~/.claude/skills`, `~/.config/opencode/skills`, `~/.agents/skills`, `~/.hermes/...`, plugins) y detectar los vendors presentes.
- **FR-2.2** El wizard DEBE **proponer** `globalSkills` y las skills por persona y aplicarlas solo tras confirmación explícita del usuario. Ningún valor de la máquina de Diego viaja como default ni como ejemplo.
- **FR-2.3** Si no hay un vendor autenticado, el descubrimiento DEBE caer al matcher local (`hermad skills match`, BM25, sin LLM). El path del wizard NO DEBE terminar en `process.exit(1)` por eso (hoy `suggest` sí: `src/commands/skills.js:215-218, 254-259`).
- **FR-2.4** Antes de enviar descripciones de skills a un LLM, hermad DEBE pedir consentimiento explícito al usuario y decirle qué se manda.
- **FR-2.5** El usuario DEBE poder saltear el paso entero. Un setup con cero skills propias es válido y NO DEBE producir warnings ni degradar el arranque de las personas.

### F3 — Wizard y idioma (T3)

- **FR-3.1** Los flujos interactivos (`setup`, `update`, `install`) DEBEN usar `@clack/prompts` cargado con `import()` dinámico **solo** dentro de esos comandos; el resto del CLI DEBE seguir sin dependencias. Esto **enmienda explícitamente** la regla "cero dependencias" del PRD anterior y sube `engines.node` a `>=20.12`.
- **FR-3.2** El wizard DEBE cubrir, como mínimo: (1) verificar prereqs (Node, `herdr`, vendors), (2) elegir vendor + modelo por persona, (3) descubrir/asignar skills, (4) aceptar o rechazar el modo bypass, (5) instalar el pack base, (6) ofrecer el completion.
- **FR-3.3** Cada paso DEBE tener modo no interactivo (`--yes` / no-TTY) que tome los defaults propuestos sin preguntar. Un paso que no pueda resolverse desatendido DEBE abortar con mensaje claro, nunca colgarse.
- **FR-3.4** Si `herdr` no está instalado, el wizard DEBE ofrecer el comando de instalación del OS (`brew install herdr` / `install.sh` / `install.ps1`) y ejecutarlo **solo** con confirmación. Si no hay ningún vendor, DEBE explicar cuál falta y salir con error claro.
- **FR-3.5** El idioma (es/en) DEBE elegirse en el setup y gobernar: los textos del wizard, el idioma de comunicación de los agentes y el idioma de BMad. Los prompts internos de las personas DEBEN quedar en inglés.
- **FR-3.6** El wizard DEBE mostrar qué archivos/rutas va a tocar antes de escribir, y una cancelación a mitad NO DEBE dejar el pack ni la config a medio escribir.
- **FR-3.7** `hermad update` con wizard DEBE detectar el método de instalación, mostrar versión actual vs. disponible, confirmar, actualizar y **re-ejecutar el relink idempotente** del pack base.

### F4 — Vendors y modelos (T4)

- **FR-4.1** Con **un solo** vendor detectado, todas las personas DEBEN asignársele automáticamente (sin preguntar persona por persona).
- **FR-4.2** Con **varios** vendors, el wizard DEBE proponer un reparto por persona y pedir confirmación.
- **FR-4.3** El **modelo** DEBE elegirlo siempre el usuario dentro del vendor elegido; hermad NO DEBE aplicar un modelo por defecto en silencio. Cuando el vendor no expone catálogo (hermes), DEBE pedir el flag a mano y aceptar vacío.
- **FR-4.4** `codex` y `gemini` DEBEN presentarse como **experimentales** (no probados en vivo) y no DEBEN ser el default de ninguna persona.
- **FR-4.5** `DEFAULT_PERSONAS` NO DEBE mezclar vendors sin que el setup los haya confirmado: el default efectivo sale de la detección, no del fuente.

### F5 — Permisos (T5) · *toca seguridad → aprobación de Diego/orquestador*

- **FR-5.1** El setup DEBE explicar en texto claro que los agentes corren sin prompts de permisos (bypass) y qué implica, y DEBE pedir aceptación explícita.
- **FR-5.2** Si el usuario rechaza el bypass, los agentes DEBEN arrancar en modo con prompts de permisos.
- **FR-5.3** La decisión DEBE persistirse en la config y ser la que aplique `spawn`/`start-team`/`plan-devs`. La escritura de esa config NO DEBE borrar claves desconocidas (el merge actual de `config.save` se mantiene).
- **FR-5.4** El modo elegido DEBE poder cambiarse después sin reinstalar.

### F6 — Completion (T6)

- **FR-6.1** `hermad completion <zsh|bash|fish|powershell>` DEBE imprimir el script a stdout (patrón `gh`), sin efectos laterales.
- **FR-6.2** `hermad completion install [--shell X]` DEBE detectar el shell (`$SHELL`, `$PSModulePath`), escribir el script en la ruta estándar y ser **idempotente** (bloque marcado, nunca duplica líneas). `uninstall` DEBE revertirlo.
- **FR-6.3** DEBE completar **comandos y flags** (los 16 subcomandos de `src/cli.js:3-24` y sus flags), desde una **tabla única** que sea la fuente de verdad.
- **FR-6.4** DEBE existir un test de paridad que falle si la tabla de completion y el `switch` de `src/cli.js` divergen.
- **FR-6.5** Rutas: zsh `~/.zfunc/_hermad` (+ bloque `# >>> hermad >>>` en `~/.zshrc` con `fpath`/`compinit`); bash `~/.local/share/bash-completion/completions/hermad` con fallback `source` en `~/.bashrc` (macOS bash 3.2); fish `~/.config/fish/completions/hermad.fish`; PowerShell línea en `$PROFILE`. `install` DEBE mostrar el archivo antes de tocarlo.
- **FR-6.6** El wizard DEBE **ofrecer** instalar el completion al final del setup; nunca hacerlo en silencio.

### F7 — Distribución y update (T7)

- **FR-7.1** La instalación soportada DEBE ser desde GitHub: `npm install -g github:DdeDiegoA/hermad`. **No** se publica al registry de npm.
- **FR-7.2** `package.json` DEBE declarar `files` (solo lo distribuible: `bin`, `src`, `skill`, `command`, `templates`), `repository` y `engines`. `graphify-out/`, `_bmad/`, `research/`, `.hermad/` NO DEBEN empaquetarse.
- **FR-7.3** El repo DEBE ser público para que un tercero pueda instalar. **Dependencia de Diego** (acción suya, no del código); hasta entonces la aceptación A1 no puede correrse con un tercero real.
- **FR-7.4** `hermad update` DEBE funcionar por los dos métodos: instalación npm global (reinstalar desde GitHub) y clone git (`git pull --ff-only`). Si no puede determinar el método, DEBE decirlo y no romper.
- **FR-7.5** `update` NO DEBE exigir un clone git ni abortar en una instalación por npm.

### F8 — Deuda que afecta a terceros (T8)

- **FR-8.1** `hermad spawn` DEBE aceptar `--story <id>` y registrar el ownership en `state.stories` (mismo formato que `plan-devs`), de modo que el auto-close del daemon NO cierre un dev con story abierta antes del DONE del reviewer.
- **FR-8.2** El auto-close DEBE negarse a cerrar cualquier agente con story asignada no terminada, sin importar si la story vino de `plan-devs` o de `spawn --story`.
- **FR-8.3** La resolución de departamento DEBE usar el mapa lógico→vivo (`src/lib/agents.js`) en vez de cortar el nombre en el primer `-`; un agente `<proyecto>-<persona>` DEBE caer en el tab de su persona.
- **FR-8.4** El aviso de ruta (`hermad send` sin respuesta / escalado) DEBE incluir branch y commit cuando el agente es un dev, para que el humano pueda ubicar el trabajo.
- **FR-8.5** `hermad send` DEBE aceptar destinos con espacios sin partir el nombre.

---

## 6. Requisitos no funcionales

- **NFR-1 Portabilidad / cero strings de entorno.** En `src/`, `templates/`, `command/` y `skill/` no DEBE haber `/Users/`, `Diego`, `opencode-go`, `deepseek` ni `kimi`. Rutas vía `os.homedir()`/`path.join` (ya se cumple: no tocar).
- **NFR-2 Dependencias.** La única dependencia nueva admitida es `@clack/prompts`, cargada dinámicamente en `setup`/`update`/`install`; el resto del CLI (incluido el completion) DEBE seguir con stdlib. `engines.node >= 20.12`.
- **NFR-3 Tests.** `node --test`; la suite actual (120+) sigue verde; cada FR nuevo deja al menos un test. Io inyectable como en `placement.js`/`daemon.js` (stubs de `execFileSync`, sin `herdr` ni red).
- **NFR-4 CI.** Los 3 OS actuales siguen corriendo; el runner Windows DEBE además ejercitar el script de completion de PowerShell.
- **NFR-5 Privacidad y consentimiento.** Ninguna descripción de skill del usuario sale hacia un LLM sin consentimiento explícito (FR-2.4). Sin secretos ni tokens en el repo.
- **NFR-6 Degradación.** Ningún camino nuevo puede colgarse en no-TTY ni romper un entorno sin BMad, sin skills propias o sin `herdr`: siempre mensaje claro + salida.
- **NFR-7 Windows.** se preserva el fallback symlink→copia, la excepción de hermes (no nativo) y el manejo de `ExecutionPolicy` en el `$PROFILE`.
- **NFR-8 Idempotencia.** Correr `setup` dos veces no DEBE duplicar enlaces, líneas de completion ni entradas de config.

## 7. Fuera de alcance

Publicar en el registry de npm · Homebrew tap · instalador `curl | sh` / `irm | iex` · completion con valores dinámicos (personas, skills) vía `hermad __complete` · embeddings para el matcher · soporte oficial de codex/gemini · subagentes internos de Claude · TUI persistente (el wizard es one-shot) · migración automática de los proyectos existentes de Diego · `herdr agent rename` · telemetría.

## 8. Criterios de aceptación

| ID | Criterio | Verificación |
|---|---|---|
| **A1** | Entorno limpio (contenedor Linux o VM Windows) con **un** vendor + `herdr`: instalar desde GitHub → `hermad setup` → `create-project` → `start-team` sin errores ni warnings de skills | Sesión cronometrada en el entorno limpio |
| **A2** | `grep -rE "/Users/\|Diego\|opencode-go\|deepseek\|kimi" src templates command skill` = 0 coincidencias (línea base 2026-10-04: **14 archivos**) | Comando en CI o test |
| **A3** | TAB completa los 16 subcomandos y sus flags en zsh, bash, fish y PowerShell | Test de paridad (FR-6.4) verde + prueba manual por shell |
| **A4** | `hermad update` funciona por npm global y por clone git, y relinkea el pack en ambos | Prueba en los dos entornos |
| **A5** | Todos los pasos del wizard tienen `--yes` / no-TTY y terminan sin input | Test no interactivo (stdin cerrado) |
| **A6** | `npm test` verde (suite actual + tests nuevos por FR) | `npm run test` |
| **A7** | Un dev lanzado con `spawn --story S` NO se auto-cierra antes del DONE del reviewer | Test de `daemon.js` con io stub + verificación en vivo |
| **A8** | Un agente con nombre colisionado (`<proyecto>-<persona>`) cae en su tab de departamento | Test de `placement`/`agents` |
| **A9** | `hermad setup` dos veces seguidas no duplica enlaces, líneas de completion ni entradas de config | Test de idempotencia |

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Symlinks colgantes tras mover el clone / update de npm | Pack en `~/.hermad/pack` + relink idempotente (FR-1.1, FR-3.7) |
| Índice de skills sobre `~/.claude/plugins/cache` lee miles de archivos y expone contenido privado | Consentimiento (FR-2.4) + índice cacheado con TTL y `--refresh` (ya existe) |
| `suggest` depende de un vendor autenticado | Fallback local BM25 en el wizard (FR-2.3) |
| Completion desactualizada al agregar un subcomando | Tabla única + test de paridad (FR-6.3/6.4) |
| Windows: hermes no nativo, symlink con permisos, `ExecutionPolicy` | Fallback copia (ya existe) + excepción hermes + NFR-7 |
| El wizard moderno sube el mínimo de Node y agrega cadena de suministro a una herramienta que corre agentes con bypass | Cambio acotado a `setup`/`update` con carga dinámica; dependencia visible y pineada (NFR-2); riesgo declarado al usuario en el paso de permisos |
| Deuda de auto-close presente hasta que aterrice T8 | T8 entra en la épica: no se abre a terceros sin ella (FR-8.1/8.2) |

## 10. Dependencias y aprobaciones

- **Diego:** hacer público el repo `DdeDiegoA/hermad` (FR-7.3). Bloquea solo la aceptación A1 con un tercero real, no el diseño.
- **Seguridad (F5):** el paso de aceptación del bypass es una decisión de seguridad ya tomada por Diego; el diseño de FR-5.1/5.2 debe pasar por el orquestador antes del build. No hay auth, dinero ni DB en la épica.
- **Sin tocar:** decisión del wizard (`@clack/prompts`), distribución por GitHub (no registry), pack base en `~/.hermad/pack`, completion solo comandos+flags, idioma elegible es/en.

## 11. Handoff

- **architect:** arquitectura de los módulos nuevos (instalador de pack + relink, wizard/consent gate, generadores de completion, resolución de método de instalación) sobre la estructura existente; qué se refactoriza de `setup.js`, `update.js`, `skills.js` (suggest → no `exit 1`), `placement.js`, `daemon.js`, `create-project.js`. Salida: `docs/hermad-para-todos-design.md`.
- **ux:** spec del wizard (T3–T5): pasos, textos, estados de error, defaults, comportamiento `--yes`/no-TTY, elección de idioma y de permisos. Salida: `docs/hermad-para-todos-ux.md` (o el artefacto que fije el architect).
- **pm (después):** `stories.yaml` con los tracks T1–T8 en olas, `files` sin solape para `hermad plan-devs` (máx 3 devs), cada story con sus tests `node --test`.
