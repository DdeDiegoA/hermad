# hermad

Orquestación multi-agente y multi-vendor sobre [Herdr](https://herdr.dev)
(terminales con estado por agente) y **BMad** (método spec-driven, opcional).

Hermad abre un equipo de agentes de coding en paneles, le da a cada uno una
persona (orquestador, dev, reviewer…), conecta un buzón entre ellos y te deja
gobernar todo desde el CLI `hermad`. Corre en **macOS, Linux y Windows** (el
soporte Windows de herdr está en beta).

- **Vendors soportados**: `claude`, `opencode`, `hermes` (probados en vivo);
  `codex` y `gemini` quedan documentados como experimentales.
- **Requisitos**: **Node ≥ 20.12**, **herdr** instalado y **al menos un vendor**.
  Hermad no instala vendors de IA por ti.

---

## Instalación

```bash
npm install -g github:DdeDiegoA/hermad
hermad setup
```

`npm i -g github:...` es el **único camino soportado** (no se publica al
registry de npm). Requiere `git` para instalar desde GitHub.

### `hermad setup` — wizard de 9 pasos

Copia el **pack base** a `~/.hermad/pack`, enlaza desde ahí a cada vendor
detectado, guarda tu configuración y te deja listo para crear proyectos.

| Paso | Qué hace |
|---|---|
| 1. Idioma | `es`/`en` para el wizard, la comunicación de los agentes y los docs de BMad. Los prompts internos de las personas siguen en inglés. |
| 2. Prerequisitos | Verifica Node ≥ 20.12, herdr y detecta los vendors instalados. Puede ofrecerte instalar herdr. |
| 3. Vendors y modelo | Reparte personas entre vendors y **elegís el modelo** de cada vendor (hermad nunca elige modelo por ti). |
| 4. Skills | Indexa las skills que ya tienes y propone cuáles activar (globales y por persona). Con consentimiento puede pedirle a un modelo que las lea; si no, usa el matcher local. |
| 5. Permisos | Elige el **modo de permisos** (ver abajo). |
| 6. BMad (opcional) | Si querés, BMad se instala en cada proyecto nuevo. Tu equipo funciona sin él. |
| 7. Resumen | Muestra exactamente qué archivos va a crear o actualizar. |
| 8. Aplicar | Copia el pack, crea enlaces y guarda la configuración. |
| 9. Completion + próximos | Ofrece instalar el autocompletado (default: no) y te da los próximos pasos. |

Flags útiles: `--yes` (no interactivo, nunca cuelga), `--lang es|en`,
`--user-name <n>`, `--model <id>`, `--skip-skills`, `--llm-suggest`,
`--accept-bypass`, `--completion`, `--skip-agents`, `--relink-only`.

Correr `hermad setup` de nuevo es seguro: no duplica nada.

### Modos de permisos

- **`prompt` (recomendado)**: cada vez que un agente quiere ejecutar un comando
  o editar un archivo, se detiene y te pregunta. El agente en espera aparece como
  `blocked` en su panel: tenés que atenderlo para que siga.
- **`bypass`**: los agentes ejecutan y editan **sin preguntar**. Es más rápido,
  pero un agente equivocado o manipulado por un archivo/página que lea puede
  tocar tu máquina sin que te enteres. Solo se activa aceptando el riesgo de
  forma explícita (o con `--accept-bypass`).

Se cambia cuando quieras: `hermad settings permissions [prompt|bypass]`.
Los agentes ya abiertos conservan el modo anterior — cerrá y reabrí el equipo.

---

## De cero a un equipo corriendo

```bash
hermad create-project mi-app       # scaffolding agentico (git, AGENTS.md, personas, comandos)
cd mi-app
hermad start-team                  # abre workspace + tabs por departamento + todos los agentes
# o bien:
hermad open-orchestrator           # abre solo el orquestador (workers bajo demanda)
hermad orchestrate "construí X"    # como start-team, y le manda el intent al orquestador
```

`start-team`, `orchestrate` y `open-orchestrator` **resuelven el proyecto
subiendo desde el cwd** (buscan `.hermad/project.json`); si no lo encuentran, usan
el activo global con un aviso. Así `cd otro-proyecto && hermad start-team` abre
ese proyecto.

Luego hablás con el equipo desde el pane del orquestador con el entrypoint
`/hermad` (Claude Code y OpenCode).

### El equipo

| Departamento (tab) | Personas |
|---|---|
| gerencia (default) | `orquestador` |
| producto | `analyst`, `pm`, `architect` |
| desarrollo | `dev` |
| qa | `reviewer` |
| diseño | `ux` |

El **orquestador solo delega**: no edita código, docs ni configs, no hace
hotfixes ni corre tests; spawnea o manda al peer correcto. Es una regla inviolable
del sistema, no una preferencia.

---

## Comandos

Tabla consistente con `src/lib/commands-table.js` (la fuente única que alimenta
el HELP, el dispatch y el completion; `test/cli-parity.test.js` la mantiene
sincronizada con los handlers).

| Comando | Flags / subcomandos | Qué hace |
|---|---|---|
| `hermad setup` | `--yes` `--lang` `--user-name` `--model` `--skip-skills` `--llm-suggest` `--accept-bypass` `--completion` `--skip-agents` `--relink-only` | Instala skill/comando y elige CLI/modelo por agente (wizard de 9 pasos) |
| `hermad create-project` | `--run-bmad-install` | Scaffolding agentico completo para un proyecto nuevo |
| `hermad settings` | `--project` `--from-global` `--accept-bypass` · sub: `agents` `project` `permissions` | Reajusta vendors/modelos (global o por proyecto) y el modo de permisos |
| `hermad start-team` | — | Abre workspace + tabs + agentes conectados, sin prompt inicial |
| `hermad open-orchestrator` | — | Abre el workspace solo con el orquestador (workers bajo demanda) |
| `hermad orchestrate` | — | Como `start-team`, pero le manda el intent al orquestador |
| `hermad daemon` | — | Pane del daemon: buzón + rutas `HERMAD:` + compact watchdog |
| `hermad agents` | `--json` | Tabla lógico → vivo, persona, kind y pane de cada agente |
| `hermad send` | `--skills` `--from` | Encola un mensaje en el buzón de un peer (adjunta rutas de `SKILL.md`) |
| `hermad note` | `--story` `--for` | Agrega una entrada al journal de memoria |
| `hermad memory` | `--story` · sub: `slice` | Imprime el bloque de memoria de una persona (AGENTS.md + journal) |
| `hermad spawn` | `--name` `--pane` `--kind` `--model` `--skills` `--story` | Dropea un agente en su tab |
| `hermad plan-devs` | `--max` | Crea worktrees + branches desde `stories.yaml` y dropea devs |
| `hermad skills` | `--refresh` `--source` `--json` `--persona` `--top` `--project` `--force` `--global` · sub: `list` `match` `suggest` `global` `global add` `global rm` | Índice cacheado, matcher local y `globalSkills` |
| `hermad completion` | `--shell` · sub: `zsh` `bash` `fish` `powershell` `install` `uninstall` | Imprime o instala el completion de hermad para tu shell |
| `hermad update` | `--yes` | Actualiza hermad (npm global o clone git) y re-linkea el pack |
| `hermad --version` / `hermad --help` | — | Versión instalada / ayuda |

---

## Daemon, buzón y marcadores

`hermad daemon` abre el panel que conecta a los agentes:

- **Buzón**: cada peer tiene su inbox en `.hermad/inbox/<peer>/`. `hermad send`
  encola un mensaje; el daemon lo entrega **solo cuando el peer está quiescente**
  (`idle`/`done`), nunca a un agente `blocked`/`working`.
- **Rutas por marcadores**: un agente emite una línea exacta en su propia pantalla
  y el daemon rutea el evento: `HERMAD:DONE story=<id> n=<seq>`,
  `HERMAD:BUG …`, `HERMAD:STORIES_READY …`. El `n` se incrementa en cada emisión
  (distingue un evento nuevo de un redibujo).
- **Auto-close**: un agente que emite `DONE` y queda quiescente se cierra solo.
  Nunca el orquestador, ni con buzón pendiente, ni un dev con story abierta.

---

## Skills

Tres niveles, de más amplio a más específico:

```bash
# Globales (todos los agentes): ~/.hermad/config.json → globalSkills
hermad skills global add bmad-help --project      # + --project para un proyecto
hermad skills global rm bmad-help
hermad skills global                             # lista las efectivas

# Por persona: frontmatter `skills:` en templates/prompts/<persona>.md
hermad skills list [--refresh] [--source S] [--json]   # índice de skills instaladas
hermad skills match "<tarea>" [--persona P] [--top N] [--json]   # matcher local (BM25)
hermad skills suggest <persona>   # propone para esa persona (no aplica solo)
hermad skills suggest --global    # propone globales (no aplica solo)

# Por tarea, al lanzar o mandar: --skills a,b
hermad spawn dev --skills bmad-build
hermad send dev "..." --skills bmad-build
```

Las skills que el vendor no soporta nativamente se cargan como rutas a su
`SKILL.md`. El índice vive en `~/.hermad/cache`.

---

## Configuración

```bash
hermad settings agents [<persona>]                     # plantilla global (~/.hermad/config.json)
hermad settings project [<persona>]                    # vendors/modelos del proyecto actual
hermad settings project --from-global                  # copia la plantilla global al proyecto
hermad settings project --project ~/ruta/proyecto      # apunta a otro proyecto
hermad settings permissions [prompt|bypass] [--accept-bypass] [--project]
```

La configuración activa del proyecto vive en `.hermad/project.json`; la global,
en `~/.hermad/config.json`. El pack distribuible está en `~/.hermad/pack` y desde
ahí se enlaza a los vendors (nunca al clone), así `update` no deja enlaces
colgando.

---

## Memoria

Dos capas:

- **`AGENTS.md`** — memoria curada del proyecto; **solo el orquestador** la
  escribe.
- **`.hermad/memory/journal.md`** — journal append-only (`hermad note`),
  inyectado por persona/story (`hermad memory slice <persona> [--story X]`).

En Claude, un hook `SessionStart` (startup/compact) inyecta la memoria; `CLAUDE.md`
incluye `@AGENTS.md`.

---

## Actualizar

```bash
hermad update          # detecta cómo instalaste (npm global o clone git) y actualiza
hermad update --yes
```

Si no puede determinar el método, te dice los dos comandos posibles; después
corré `hermad setup --relink-only` para refrescar los enlaces.

---

## Completion

```bash
hermad completion zsh          # imprime el script a stdout
hermad completion install      # instala en tu shell (o detecta)
hermad completion uninstall    # revierte el bloque marcado (# >>> hermad >>>)
```

Soporta `zsh`, `bash`, `fish` y `powershell`.

---

## Windows (nativo, beta)

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://herdr.dev/install.ps1 | iex"
npm i -g github:DdeDiegoA/hermad
hermad setup
```

- `hermes` no corre nativo en Windows: usá WSL, o asigná sus personas a
  `claude`/`opencode` con `hermad settings agents`. `setup` lo avisa.
- `setup` usa junctions/copias (sin admin) cuando el symlink no está permitido.
- Si `PowerShell` tiene `ExecutionPolicy Restricted`, `setup` no toca tu perfil.
- El script `skill/scripts/orquestar.sh` es bash (referencia); en Windows usá el CLI.

---

## Troubleshooting

- **`hermad` no encuentra herdr**: `setup` avisa y puede ofrecerte instalarlo. Sin
  herdr no se puede abrir el equipo (`start-team`); el resto del CLI funciona.
- **Los agentes se frenan**: estás en modo `prompt`. Mirá los paneles con estado
  `blocked` y atenderlos, o pasá a `bypass` aceptando el riesgo.
- **Un vendor no aparece**: hermad solo usa los que detecta instalados. Instalá el
  vendor y repetí `hermad setup` (es seguro repetirlo).
- **`update` no detecta el método**: corré a mano `npm i -g github:DdeDiegoA/hermad`
  o `git pull --ff-only` en el clone, y después `hermad setup --relink-only`.
- **Sin autocompletado**: `hermad completion install` y abrí una terminal nueva.

---

## Privacidad

- Hermad no descarga ni instala skills: indexa las que ya tenés.
- Si aceptás la recomendación remota de skills, al modelo solo se le envían el
  nombre y la descripción corta de cada skill, y el nombre y el rol en una línea
  de cada persona. **Nunca** el contenido de las skills, tus archivos ni tus
  proyectos. Si decís que no, se usa un matcher local.
- En CI, `test/portability.test.js` garantiza que lo distribuido no contiene
  strings del entorno del autor.

---

## Desarrollo

Estructura del repo:

| Path | Qué es |
|---|---|
| `bin/hermad.js` | Entrypoint del CLI |
| `src/cli.js` | Dispatcher (a partir de `src/lib/commands-table.js`) |
| `src/commands/` | Handlers de cada subcomando |
| `src/lib/` | Herdr, vendors/modelos, `render` por proyecto, daemon, memoria, skills, config |
| `src/wizard/` + `src/i18n/` | Pasos del wizard de `setup` y textos es/en |
| `templates/prompts/` | System prompt por persona |
| `command/` | Entrypoint `/hermad` (Claude Code + OpenCode) |
| `skill/` | Skill `herdr-bmad` (protocolo completo + pitfalls) |
| `docs/`, `research/` | Guías e investigación por vendor/plataforma |
| `.github/workflows/test.yml` | CI: `npm test` en ubuntu, macOS y Windows |

```bash
npm ci
npm test          # node --test
```
