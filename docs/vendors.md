# Vendors — matriz de capacidades (Fase 0)

Fecha: 2026-09-27 · Versiones probadas: claude 2.1.283, opencode 1.18.32, hermes 0.21.0, herdr 0.9.0.
Método: `--help` + archivos de config reales + pruebas en vivo (marcadas ✔). Cada celda dice **verificado** o **no soportado**.

## Matriz

| Dimensión | claude | opencode | hermes | codex / gemini |
|---|---|---|---|---|
| **System prompt** | `--append-system-prompt-file <path>` (y `--system-prompt-file`) ✔ existe y funciona (oculto en `--help`) | `prompt:` del agente md (`{file:...}`) + `--agent <nombre>` | `SOUL.md` por profile (`~/.hermes/profiles/<p>/SOUL.md`) | codex: `model_instructions_file` · gemini: `GEMINI_SYSTEM_MD` (docs, no instalados) |
| **Memoria** | `CLAUDE.md` nativo (NO `AGENTS.md`) + `--add-dir` | `AGENTS.md` nativo (sube hasta la raíz git) + `instructions[]` | `memories/` del profile + `delegation.vault_context` | codex: `AGENTS.md`; gemini: `GEMINI.md` |
| **Skills (allowlist)** | `--setting-sources project` oculta skills/plugins de usuario ✔ · deny `Skill(<ns>:<name>)` bloquea una ✔ · `Skill`/`Skill(*)` bloquea todas · `--disable-slash-commands` | `permission.skill` global + override en frontmatter del agente (`deny` oculta) · `tools.skill:false` | flag `--skills a,b` · dir `skills/` del profile · `--ignore-user-config` | codex: `~/.codex/skills` (?) · gemini: `--extensions` (docs) |
| **Compact (umbral %)** | env `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` vía `--settings` | `compaction.auto/prune/reserved` — **sin umbral %** → watchdog | `compression.threshold` **por profile** (`config.yaml`) | n/a |
| **Comandos slash** | `~/.claude/commands/<ns>/<cmd>.md` → `/ns:cmd` (subdir = namespacing) | `~/.config/opencode/commands/<file>.md` → `/<file>`; **sin namespacing** | no aplica (skills, no slash) | codex: prompts; gemini: custom commands (docs) |
| **Hooks** | settings/plugins, eventos `SessionStart`/`PostToolUse`… | plugins (`.opencode/plugins`) | `hooks/` del profile | codex: hooks (docs) |

## Spikes

- **S1 hermes ✔** — Profile = dir aislado `~/.hermes/profiles/<nombre>/` con **`config.yaml` y `SOUL.md` propios** (`hermes profile create [--clone] [--no-skills]`, `delete -y`). Un `--clone` copia config+SOUL+skills. Por lo tanto: persona → `SOUL.md` del profile; compact al 50% → `compression.threshold: 0.5` en el `config.yaml` del profile (sin tocar `~/.hermes/config.yaml`); allowlist → `--skills a,b` o el dir `skills/` del profile. **No se requiere kludge global.**
- **S2 claude ✔ (Plan A descartado, Plan B bueno)** — `--safe-mode` **desactiva también `--plugin-dir`** (probado: skill y hook del plugin no cargaron), y además mata `CLAUDE.md` y hooks → **no sirve** para allowlist. Mecanismo recomendado:
  1. `--setting-sources project,local` (excluir `user`) → desaparecen skills y plugins de usuario ✔; la persona se entrega en `.claude/skills/` del proyecto → superficie limpia.
  2. Fallback por permisos: deny `Skill(<plugin>:<skill>)` bloquea una skill puntual ✔; `Skill(*)` bloquea todas; **deny > allow, allow no abre hueco al deny** → allowlist por permisos = deny del complemento (enumerar instaladas) o la allowlist blanda por prompt ya prevista en riesgos.
  3. `--append-system-prompt-file <path>` verificado ✔ (existe aunque no salga en `--help`).
- **S3 opencode ✔** — Permisos por skill sí: `permission.skill: { "patrón": allow|ask|deny }` global, override en frontmatter del agente; `deny` oculta la skill. Agentes en `.opencode/agents/` (plural; singular soportado). **Compaction sin umbral %** → el watchdog del daemon (Fase 6) es necesario para opencode.
- **S4 herdr** — `agent start <name> --kind K --pane ID [--timeout MS] [-- args...]`; “arguments after `--` are passed unchanged to that executable”; herdr sigue rechazando args multilínea. **Mitigación: pasar SIEMPRE rutas de archivo, no JSON inline** (`.hermad/generated/settings/<persona>.json`, `--append-system-prompt-file <path>`), así no hay problemas de comillas/espacios.
- **S5 comandos namespaced** — claude sí (`commands/hermad/orchestrate.md` → `/hermad:orchestrate`). opencode **no** namespacea por subdir → su nombre plano sería `/hermad-orchestrate`. Decisión: comando canónico `/hermad:orchestrate` en claude; en opencode documento el alias plano.
- **S6 codex/gemini** — no instalados (codex ausente, gemini ausente). Documentados como fallback (`agent prompt` en idle), primera clase queda fuera de alcance (D1).

## Impacto en el plan

- **Fase 2 (system prompt)**: claude usa `--append-system-prompt-file` (confirmado); opencode `--agent`; hermes `SOUL.md` del profile. Sin mensaje inicial visible.
- **Fase 3 (memoria)**: claude necesita `CLAUDE.md` con `@AGENTS.md` (sigue en pie; `--setting-sources project` no afecta proyectos).
- **Fase 4 (skills)**:
  - claude: per-persona skills en `.claude/skills/` del proyecto + `--setting-sources project,local` (limpio). Plan B = deny del complemento.
  - opencode: `permission.skill` en el frontmatter del agente.
  - hermes: `--skills` o dir del profile.
- **Fase 5 (daemon)**: `--settings` y prompts por archivo (S4), no JSON inline.
- **Fase 6 (compact)**: claude nativo (`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50`), hermes `compression.threshold` por profile; watchdog solo para opencode.
- **Fase 7 (orquestación)**: clarificación de tracks en claude; readers con `--setting-sources project,local` y sin Edit/Write.
- **AGENTS-template**: hermes no lee `AGENTS.md` nativo → para hermes inyectar el slice vía `SOUL.md`/prompt (o equivalente a `CLAUDE.md`).

## Evidencia (comandos clave)

```
claude --safe-mode --plugin-dir <plugin> ...            # skill/hook del plugin NO cargan
claude --plugin-dir <plugin> --settings '{"permissions":{"deny":["Skill(hermad-probe:hermad-probe-skill)"]}}' ...  # bloqueado
claude --setting-sources project -p "¿tienes skill X?"  # SKILL_NO (oculta skills de usuario)
claude --append-system-prompt-file <path> -p "..."      # OK
hermes profile create ... ; ls ~/.hermes/profiles/<p>/  # config.yaml + SOUL.md propios
opencode agent list / docs/agents · docs/skills         # permission.skill, compaction sin %
```
