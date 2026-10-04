---
artifact: SPEC
epic: hermad para todos
version: "0.3"
date: 2026-10-04
author: pm (John)
companions:
  - docs/hermad-para-todos-prd.md
  - docs/hermad-para-todos-design.md
  - docs/hermad-para-todos-ux.md
  - AGENTS.md
sources:
  - docs/hermad-para-todos-research.md
  - docs/hermad-para-todos-brief.md
  - docs/mejoras-2026-10.md (epica anterior, cerrada)
---

# SPEC — hermad para todos

Condensado ejecutable de la epica. El detalle vive en los `companions`; aca va el kernel:
por que, que capacidades, que limites, que NO, y como se sabe que funciono.

## Why

Hermad funciona **solo porque la maquina de Diego ya tiene todo lo que asume**: ~30 skills propias,
plugins, BMad por proyecto, dos vendors autenticados y `herdr` en el PATH. Un tercero que corre
`hermad setup` obtiene personas que nombran skills `bmad-*` inexistentes, vendors y modelos de otra
maquina, textos que dicen "Diego", symlinks en vendors que no instalo, un `update` que exige un clone
git y ningun completion de shell. **No faltan features: falta un primer usuario que no sea Diego.**

## Capabilities

| id | capability | intent | success |
|---|---|---|---|
| CAP-1 | Tabla unica de comandos (`COMMANDS`) que alimenta HELP, dispatch y completion | que agregar un comando no pueda desincronizar la ayuda ni el TAB | `test/cli-parity.test.js` falla si la tabla y los `--flag` leidos por `src/commands/*` divergen; `hermad --help` se genera desde la tabla |
| CAP-2 | Modo de permisos explicito y persistido (bypass vs prompting) | que correr agentes sin permisos sea una decision consciente, una sola vez, y nunca un default silencioso | `config.permissions.mode` gobierna spawn/start-team/plan-devs via `render`; `--yes` nunca activa bypass; la config legacy no pierde claves |
| CAP-3 | Deudas que le pegan a terceros, cerradas | que un usuario nuevo no vea agentes cerrándose antes de tiempo ni tabs equivocados | `spawn --story` registra ownership y el auto-close no cierra un dev antes del DONE del reviewer; `basePersona` resuelve nombres colisionados |
| CAP-4 | Completion de comandos y flags en 4 shells | que el CLI se pueda descubrir sin memorizar 16 subcomandos | `hermad completion <shell>` imprime el script; `install` idempotente; paridad con la tabla verde en CI (Linux + `pwsh` en Windows) |
| CAP-5 | Prompts autosuficientes y BMad opcional | que una persona arranque y trabaje sin BMad, sin warnings y sin strings del entorno del autor | con BMad ausente no hay warnings; el grep de A2 da 0 en `src templates command skill` |
| CAP-6 | Nucleo del wizard (UI, i18n, deteccion, pack, metodo de instalacion) | tener las piezas reusables antes de escribir un solo paso | `ui.headless` resuelve todo con stdin cerrado; `pack.install`/`relink` atomicos e idempotentes; `--yes` nunca se cuelga |
| CAP-7 | `hermad setup` guiado de punta a punta | que un usuario nuevo llegue a un equipo andando sin editar JSON | en entorno limpio con un vendor: `setup → create-project → start-team` sin errores ni warnings de skills |
| CAP-8 | Instalacion y update por metodo detectado | que `update` funcione igual en npm global y en clone git | `hermad update` detecta el metodo, actualiza y relinkea el pack; metodo desconocido → instrucciones y exit 0 |

## Constraints

- **Dependencias:** la unica nueva admitida es `@clack/prompts`, con `import()` dinamico solo en
  `setup`/`update`/`settings permissions`; el resto del CLI sigue con stdlib. `engines.node >= 20.12`.
- **Tests:** `node --test`, io inyectable (stubs de `execFileSync`, `fs`, `stdin`), sin `herdr` ni red.
  Cada FR nuevo deja al menos un test.
- **Paralelismo:** maximo 3 devs; `files` sin solape entre stories concurrentes; un solo writer por archivo.
- **Seguridad:** el modo bypass es decision de Diego. Sin aprobacion explicita no se mergea (gate en
  `HPT-CONFIG-PERMS` y `HPT-SETUP`). No hay auth, dinero ni DB en la epica.
- **Compatibilidad:** el setup y la config actuales de Diego siguen funcionando (config legacy ⇒ bypass +
  aviso, sin regresion); Windows conserva el fallback symlink→copia.
- **Distribucion:** se instala desde GitHub (`npm i -g github:DdeDiegoA/hermad`); no se publica al registry.

## Non-goals

Publicar en el registry de npm · Homebrew tap · `curl | sh` · completion con valores dinamicos
(`hermad __complete`) · embeddings para el matcher · soporte oficial de codex/gemini (quedan
experimentales) · TUI persistente (el wizard es one-shot) · migrar los proyectos existentes de Diego ·
`herdr agent rename` · telemetria · instalar vendors o editar personas dentro del wizard.

Motivo comun: cada uno agrega superficie sin resolver el dolor — el primer usuario que no es Diego.

## Success signal

Guion unico, en un entorno limpio (contenedor Linux o VM Windows) con **un** vendor y `herdr`:

```
npm i -g github:DdeDiegoA/hermad
hermad setup          # 9 pasos guiados, sin editar JSON
hermad create-project demo
hermad start-team     # workspace + tabs + agentes
```

Termina sin errores y **sin warnings de skills**. Se cierra con:
`grep -rE "/Users/|Diego|opencode-go|deepseek|kimi" src templates command skill` = 0
(linea base 2026-10-04: 14 archivos); TAB completa subcomandos y flags en zsh, bash, fish y PowerShell;
`hermad update` funciona por npm global y por clone git; `npm run test` verde.

Contra-metrica: el setup de Diego no se degrada — su flujo no cambia y la suite sigue verde.
