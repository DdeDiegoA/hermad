# Brief — hermad para todos

Fuente: `docs/hermad-para-todos-research.md` (analyst, secciones a–f) + decisiones finales de Diego (buzón `pm`, 2026-10-04T06:17Z). Este brief no reabre decisiones: fija problema, usuario y éxito. PRD: `docs/hermad-para-todos-prd.md`.

## Qué es esto

Hermad instala y gobierna un equipo de agentes (Herdr × BMad): elige CLI/modelo por persona, arma el workspace por departamentos, y coordina el trabajo vía buzón y marcadores `HERMAD:`. Funciona — **porque la máquina de Diego ya tiene todo lo que assume**: ~30 skills en `~/.claude/skills`, plugins propios, BMad instalado por proyecto, dos vendors autenticados, `herdr` en el PATH.

Un tercero corre `hermad setup` y obtiene: personas que nombran skills `bmad-*` inexistentes (`templates/prompts/*.md:3`), vendors por defecto que no tiene (`src/lib/config.js:11-20` mezcla claude y opencode), modelos de un provider ajeno (`opencode-go/deepseek-v4.1-flash`), texto que dice "notify **Diego**" en las plantillas que se copian a su repo (`templates/AGENTS-template.md:26`), `setup` que crea symlinks en `~/.hermes` aunque hermes no exista (`src/commands/setup.js:12-19`), `update` que asume un clone git (`src/commands/update.js:10-21`) y ningún completion de shell. Encima, el `setup` actual es un `select` numerado repetido 8 veces (`src/commands/setup.js:90-95`).

**El problema no es que falten features: es que hermad no tiene un primer usuario que no sea Diego.**

## Quién es el usuario

| | Hoy | Usuario objetivo |
|---|---|---|
| **Quién** | Diego, mantenedor, con la máquina ya armada | Dev que quiere un equipo de agentes en un repo, con **un** vendor instalado (`claude` *o* `opencode`) y `herdr` recién bajado del sitio |
| **Dolor** | — | JSON editado a mano, skills fantasma, modelos de otro, cero guía; no sabe qué le falta ni por qué falla |
| **Criterio de éxito propio** | — | "Funcionó en una máquina limpia sin abrir un JSON" |

Secundarios: **Diego** (deja de ser el único mantenedor posible; su setup sigue funcionando) y **el contribuidor** (`git clone` + `npm link`, tests en 3 OS).

## Qué cambia

Cinco frentes, todos apuntados a lo mismo (primer usuario real):

1. **Funciona sin BMad.** El pack base (skill `herdr-bmad` + comandos `/hermad`) se versiona en el repo y `setup` lo instala en `~/.hermad/pack`. Las personas embeben su método (spec → stories → build → review) y las skills `bmad-*` pasan a ser opcionales ("si existen, usalás"). BMad se **ofrece** instalar, nunca se asume.
2. **Skills descubiertas, no heredadas.** `setup` indexa las skills del usuario, propone `globalSkills` y las de cada persona, y Diego-confirma. Nada de la máquina de Diego viaja en el repo. Sin vendor autenticado → matcher local (BM25), nunca un `exit 1`. Se pide consentimiento antes de mandar descripciones a un LLM.
3. **Wizard.** `@clack/prompts` (enmienda explícita a la regla "cero deps"), pasos guiados con `--yes`/no-TTY en todos, idioma es/en elegido en el setup, prereqs chequeados (node, herdr, vendors) con el comando de instalación ofrecido, no ejecutado en silencio.
4. **Distribución.** `npm i -g github:DdeDiegoA/hermad` (sin publicar al registry), `hermad update` que detecta el método (npm global vs clone git) y re-linkea el pack. El repo pasa a público (acción de Diego).
5. **Completion** de comandos y flags para zsh, bash, fish y PowerShell, con test de paridad contra el `switch` de `src/cli.js`.

## Éxito (observable)

Una máquina limpia (contenedor Linux o VM Windows) con **un** vendor + `herdr`:

```
npm i -g github:DdeDiegoA/hermad
hermad setup          # wizard guiado, sin editar JSON
hermad create-project demo
hermad start-team     # workspace + tabs + agentes, sin errores ni warnings de skills
```

Y, en el repo: `grep` de strings de Diego (`/Users/`, `Diego`, `opencode-go`, `deepseek`, `kimi`) en `src/ templates/ command/ skill/` = **0**; TAB completa los subcomandos y flags en los 4 shells; `hermad update` funciona por npm y por git; `npm test` verde con la suite actual más la nueva.

## No-objetivos

Publicar en el registry de npm, Homebrew tap, instalador `curl | sh`, valores dinámicos en el completion, soporte oficial de codex/gemini (quedan experimentales), TUI persistente, migrar los proyectos existentes de Diego, y dos deudas que **sí** entran por tocar a terceros: el auto-close que cierra un dev antes de que el reviewer apruebe y `normalizePersona` que corta en el primer `-`.

## Estado

Plan en curso: fase PM (este brief + PRD) → architect → ux (wizard) → pm (stories). Sin stories todavía.
