# Changelog

Todos los cambios notables de hermad se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el versionado es [Semantic Versioning](https://semver.org/lang/es/).

## [0.3.0] — 2026-10-04

Cierra las épicas internas *mejoras 2026-10* y *hermad para todos*: gobierno de
agentes (nombres vivos, auto-close, tabs), skills (índice, matcher, por tarea) y
la instalación guiada de punta a punta con `hermad setup`.

### Added

- **Nombres lógicos ↔ vivos de agentes**: `hermad agents` lista el mapa; si un
  nombre está tomado, el vivo pasa a `<proyecto>-<persona>` mientras el buzón y
  las rutas siguen usando el nombre lógico.
- **Auto-close** en el daemon: un agente que emite `DONE` y queda quiescente
  (`idle`/`done`) se cierra solo. Nunca cierra al orquestador, a un agente con
  buzón pendiente ni a un dev con story abierta. Se apaga con `autoClose: false`.
- **Tabs de departamento garantizados**: cada persona cae en su tab (producto,
  desarrollo, qa, diseño); el tab por defecto de un workspace nuevo es `gerencia`.
- **Índice de skills + matcher local**: `hermad skills list|match|suggest`
  (índice cacheado en `~/.hermad/cache`, BM25 local, sin red) y
  `hermad skills global add|rm`.
- **`globalSkills`**: skills para todo el equipo en `~/.hermad/config.json`,
  con altas/bajas por proyecto en `.hermad/project.json`.
- **Skills por tarea según vendor**: `hermad spawn|send --skills a,b`; las que
  el vendor no soporta nativamente se cargan como rutas a `SKILL.md`.
- **Regla inviolable — el orquestador solo delega**: horneada en el prompt de la
  persona, en los entrypoints `/hermad` y en el briefing, con test que la guarda.
- **`hermad setup`**: wizard de 9 pasos (idioma → prerequisitos → vendors y
  modelo → skills → permisos → BMad → resumen → aplicar → completion) con
  `@clack/prompts` y fallback readline/headless. `--yes` nunca cuelga.
- **Pack base** en `~/.hermad/pack` + enlaces a los vendors detectados;
  descubrimiento de skills instaladas con consentimiento (al modelo solo
  nombre, descripción corta, y nombre y rol en una línea por persona) y
  fallback local.
- **Modo de permisos**: `prompt` (por defecto, los agentes preguntan) o `bypass`
  (solo con aceptación explícita de riesgo o `--accept-bypass`).
- **BMad opcional** al crear proyectos.
- **`hermad completion <zsh|bash|fish|powershell>`** + `install`/`uninstall`
  idempotente, generado desde la tabla de comandos.
- **`hermad update`** por método de instalación detectado (npm global o clone
  git), más `hermad setup --relink-only`.
- **Documentación**: `README` reescrito para ir de cero a un equipo corriendo,
  este `CHANGELOG` y guías en `docs/`.

### Changed

- Prompts de personas autosuficientes: sin dependencia de BMad ni strings del
  entorno del autor; placeholders y `optionalSkills`.
- Frontmatter de personas sin skills globales (`herdr-bmad`, `rag-pipeline`,
  `graphify`); `reader` queda con `skills: []`.
- Política de skills por tarea: antes de cada delegación el orquestador corre
  `hermad skills match "<tarea>" --persona <p>` y pasa todas las candidatas
  relevantes con `--skills` (sin tope de cantidad).

### Fixed

- `herdr.agentRead` parseaba JSON sobre texto: las rutas `HERMAD:` nunca se
  disparaban.
- Marcadores `HERMAD:`: solo se aceptan en su propia línea exacta, con dedupe por
  identidad `evento|story|n` (re-emitir exige un `n` nuevo).
- `project.hydrate` descartaba `routes`/`autoClose`/`skills`; `config.save` ya no
  borra `globalSkills` del disco.
- `state.closed` no se limpiaba al relanzar un agente (el daemon no le entregaba
  el buzón) ni sobrevivía al write-back.
- El auto-close ya no cierra a un dev lanzado con `spawn --story` antes de la
  revisión.
- `basePersona` con alias y colisiones de `safeSkillDir` entre personas.

### Security

- El modo `bypass` de permisos exige aceptación explícita (`--accept-bypass`);
  las configuraciones legacy migran a bypass con aviso.
- Al modelo que recomienda skills solo se le envían nombres, descripciones cortas
  y el nombre y rol en una línea por persona — nunca el contenido de las skills,
  ni archivos, ni proyectos.
- `startPlan` fail-closed ante un modo de permisos desconocido.
- Gates de seguridad revisados antes de mergear: permisos, setup y "send less".

### CI

- `npm test` verde en ubuntu, macOS y Windows: `safeSkillDir` saneado en Windows,
  `npm ci` desde el lockfile, worktrees con `realpathSync.native` y shells `.cmd`
  correctos para npm/hermad en Windows.

## [0.2.0] — 2026-09-27

### Added

- Soporte **Windows nativo** (beta de herdr): panes con `cmd.exe`/PowerShell vía
  ConPTY; `hermad setup` usa junctions y copia de archivos cuando el symlink no
  está permitido (sin admin) y avisa que `hermes` corre solo vía WSL.

### Fixed

- Llamado a `opencode` en Windows a través de su shim `.cmd` (`shell` en win32).
