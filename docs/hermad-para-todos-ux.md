# UX — Wizard de `hermad setup` (v0.1)

Autor: ux (Sally) · 2026-10-04 · Fuentes: `docs/hermad-para-todos-{prd,design}.md` (§6, §4, §10), `AGENTS.md`.
Las decisiones de Diego **no se reabren**. Este documento fija pasos, textos (es/en), estados de error y el comportamiento sin TTY. Los textos están pensados para `@clack/prompts`; los adaptadores `readline` y `headless` muestran el mismo contenido (ver §12.4).

> ## ⚠️ PARA APROBACIÓN DE DIEGO / ORQUESTADOR
> **Paso 5 — Permisos (§6)** y **`hermad settings permissions` (§11.1)** son parte con gate de seguridad (design §4, PRD F5). No se construye `HPT-CONFIG-PERMS` ni el paso `permissions.js` hasta que el texto del riesgo y el flujo de aceptación estén aprobados. Puntos concretos a decidir en §6.5.

---

## 0. El viaje

**Quién es:** una dev con un vendor (`claude` u `opencode`), tal vez sin `herdr`, sin BMad, con pocas skills propias. Acaba de correr `npm i -g github:DdeDiegoA/hermad`. No conoce el vocabulario de hermad (persona, pack, bypass, buzón).

**Qué necesita:** llegar a `hermad start-team` sin editar JSON y sin que nada la sorprenda: ni un archivo tocado que no vio, ni un permiso concedido que no entendió, ni una descripción suya enviada a un LLM sin saberlo.

**Por qué este diseño:** cada paso hace **una** pregunta, con un default seguro, y dice **qué va a pasar** antes de pasar. Nada se escribe hasta el resumen (paso 7). Lo riesgoso (bypass, enviar datos a un LLM, tocar el `rc` del shell) siempre arranca en "no".

### Principios

1. **Un paso = una decisión.** Si un paso tiene dos, se parte.
2. **Default seguro, nunca silencioso.** Si hay default, se ve marcado; lo que implique riesgo o salida de datos arranca en "No".
3. **Todo lo que se toca se muestra antes** (paso 7) y la cancelación antes del paso 8 no deja rastro.
4. **Un solo vendor = cero preguntas de reparto** (se informa con una nota, no se pregunta).
5. **El modelo lo elige siempre el usuario**; hermad no propone modelo por su cuenta.
6. **Cada error dice qué pasó, por qué importa y el siguiente comando.** Nunca solo "error".
7. **Accesibilidad:** nada depende solo del color ni de emojis; los símbolos de clack (`◇ ● ▲`) siempre acompañan texto ("Aviso:", "Error:"). Todas las listas se operan con ↑/↓, espacio, enter; en `readline` por número. Ancho de texto ≤ 76 columnas. Sin animaciones salvo el spinner, que siempre lleva etiqueta.

### Mapa de pasos

```
 1 Idioma ─ 2 Prerequisitos ─ 3 Vendors y modelo ─ 4 Skills ─ 5 Permisos ⚠️ ─ 6 BMad ─ 7 Resumen ─ 8 Aplicar ─ 9 Listo + completion
 └───────────────────────── collect (no escribe nada) ──────────────────────┘   └── apply ──┘
```

Nota sobre el orden pedido por el orquestador: "prerequisitos" se enumeró primero, pero **idioma va antes** (design §6): así hasta los errores de prerequisitos salen en el idioma elegido. Si Node es demasiado viejo, `clack` ni carga: ese único mensaje sale **bilingüe** (§12.1).

---

## 1. Convenciones de copy

- Tuteo neutro en español ("vos" no: la persona usuaria no es necesariamente rioplatense). Frases cortas, verbos de acción.
- Palabras de la casa, con la primera mención explicada: **persona** (un rol del equipo: orquestador, dev…), **vendor** (la herramienta de IA: claude, opencode…), **pack** (los archivos base que hermad instala).
- `{x}` = valor dinámico. `[…]` = elemento interactivo. Los comandos van en `code`.
- Las claves de i18n sugeridas están en cursiva bajo cada pantalla (`wizard.<paso>.<clave>`).

---

## 2. Paso 1 — Idioma

Primer paso. Default = locale (`LANG`/`Intl` empieza con `es` → es, si no en). `--lang` lo salta.

Esta pantalla es la única que se muestra **bilingüe** (todavía no hay idioma).

```
┌  hermad setup
│
◆  Idioma / Language
│  ● Español
│  ○ English
└
```

Nota (después de elegir, ya en el idioma elegido), *wizard.language.note*:

| es | en |
|---|---|
| `Este idioma se usará en este asistente, para que tus agentes se comuniquen contigo y para los documentos de BMad. Los prompts internos de las personas siguen en inglés.` | `This language is used in this wizard, for your agents to talk to you, and for BMad documents. The personas' internal prompts stay in English.` |

Sin pregunta de nombre en el wizard: `userName` queda vacío (los prompts dicen "the user"). Opcional por flag: `--user-name`.

---

## 3. Paso 2 — Prerequisitos

Sin preguntas salvo la instalación de `herdr`. Es un spinner por chequeo y una nota final con el estado.

### 3.1 Pantalla de estado (todo bien)

```
◇  Revisando tu entorno…
│
◇  Entorno
│  ✔ Node {v} (necesitas ≥ 20.12)
│  ✔ herdr {v}
│  ✔ Vendors detectados: claude, opencode
```

| clave | es | en |
|---|---|---|
| `prereqs.title` | `Revisando tu entorno…` | `Checking your environment…` |
| `prereqs.node.ok` | `Node {v} (necesitas ≥ 20.12)` | `Node {v} (needs ≥ 20.12)` |
| `prereqs.herdr.ok` | `herdr {v}` | `herdr {v}` |
| `prereqs.vendors.ok` | `Vendors detectados: {lista}` | `Detected vendors: {list}` |
| `prereqs.vendors.exp` | `{n} (experimental: no probado en vivo)` | `{n} (experimental: not tested live)` |

Los vendors `codex` / `gemini` aparecen con el sufijo `experimental`. Los símbolos `✔ ✖ ▲` van siempre con el texto; en terminales sin Unicode se degradan a `[ok] [x] [!]`.

### 3.2 `herdr` ausente (confirmación para instalar)

```
▲  No encontré herdr
│  herdr es el panel donde viven tus agentes. Sin él, hermad no puede abrir
│  el equipo (start-team). Puedes seguir con el setup y instalarlo después.
│
│  Comando para tu sistema:
│    brew install herdr
│
◆  ¿Lo instalo ahora ejecutando ese comando?
│  ○ Sí, instalar   ● No, lo haré yo   
└
```

| clave | es | en |
|---|---|---|
| `prereqs.herdr.missing.title` | `No encontré herdr` | `herdr not found` |
| `prereqs.herdr.missing.body` | `herdr es el panel donde viven tus agentes. Sin él, hermad no puede abrir el equipo (start-team). Puedes seguir con el setup e instalarlo después.` | `herdr is the panel where your agents live. Without it, hermad can't open the team (start-team). You can continue the setup and install it later.` |
| `prereqs.herdr.cmd` | `Comando para tu sistema:` | `Command for your system:` |
| `prereqs.herdr.ask` | `¿Lo instalo ahora ejecutando ese comando?` | `Run that command now to install it?` |
| `prereqs.herdr.yes` / `no` | `Sí, instalar` / `No, lo haré yo` | `Yes, install` / `No, I'll do it myself` |

- Default: **No** (ejecutar un instalador es una acción con efectos fuera de hermad; solo con confirmación — FR-3.4).
- Si el comando falla: nota `Error: la instalación de herdr falló (código {n}). Salida guardada en {log}. Instálalo a mano y vuelve a correr hermad setup.` / `Error: herdr install failed (code {n}). Output saved to {log}. Install it manually and re-run hermad setup.` El setup **sigue** (herdr no bloquea configurar).
- Si dice "No": nota de una línea `Sigo sin herdr. Antes de start-team ejecuta: {cmd}` / `Continuing without herdr. Before start-team, run: {cmd}`.
- Comando por OS: macOS `brew install herdr`; Linux `install.sh`; Windows `install.ps1` (el texto exacto lo da `detect.js`; la pantalla solo lo muestra).

### 3.3 Sin ningún vendor → abort (ver §12.2)

### 3.4 Node viejo → abort (ver §12.1)

---

## 4. Paso 3 — Vendors y modelo

### 4.1 Un solo vendor → nota, sin pregunta

```
◇  Vendor
│  Solo encontré claude, así que todas las personas lo usarán.
│  (Una persona es un rol de tu equipo: orquestador, dev, reviewer…)
```

| clave | es | en |
|---|---|---|
| `vendors.single` | `Solo encontré {vendor}, así que todas las personas lo usarán. (Una persona es un rol de tu equipo: orquestador, dev, reviewer…)` | `I only found {vendor}, so every persona will use it. (A persona is a role on your team: orchestrator, dev, reviewer…)` |

### 4.2 Varios vendors → propuesta con confirmación

Primero se muestra la propuesta como nota (no como 7 selects), y se pregunta una vez:

```
◇  Reparto propuesto
│  orquestador   → claude
│  architect     → claude
│  pm            → claude
│  analyst       → opencode
│  dev           → opencode
│  reviewer      → opencode
│  ux            → opencode
│
◆  ¿Usamos este reparto?
│  ● Sí, usarlo   ○ Quiero cambiarlo
└
```

| clave | es | en |
|---|---|---|
| `vendors.split.title` | `Reparto propuesto` | `Proposed assignment` |
| `vendors.split.ask` | `¿Usamos este reparto?` | `Use this assignment?` |
| `vendors.split.yes` / `edit` | `Sí, usarlo` / `Quiero cambiarlo` | `Yes, use it` / `I want to change it` |
| `vendors.split.edit.persona` | `Vendor para {persona}` | `Vendor for {persona}` |

- "Quiero cambiarlo" abre **un select por persona**, con el vendor propuesto preseleccionado. Se pueden saltar con enter.
- `codex`/`gemini` aparecen en el select con la etiqueta `(experimental)` y **nunca** preseleccionados.

### 4.3 Modelo: siempre lo elige el usuario

Se pregunta **una vez por vendor** (no por persona), con la opción de afinar por persona.

```
◆  Modelo para claude
│  ○ sonnet
│  ○ opus
│  ○ haiku
│  ○ Otro (escribirlo)…
│  ○ Dejar el modelo por defecto de claude
└
◆  ¿Usar el mismo modelo en todas las personas de claude?
│  ● Sí   ○ No, elegir por persona
└
```

| clave | es | en |
|---|---|---|
| `model.ask` | `Modelo para {vendor}` | `Model for {vendor}` |
| `model.other` | `Otro (escribirlo)…` | `Other (type it)…` |
| `model.default` | `Dejar el modelo por defecto de {vendor}` | `Keep {vendor}'s own default model` |
| `model.same` | `¿Usar el mismo modelo en todas las personas de {vendor}?` | `Use the same model for every {vendor} persona?` |
| `model.same.no` | `No, elegir por persona` | `No, choose per persona` |
| `model.note` | `hermad no elige modelos por ti: lo que elijas aquí es lo que se usará.` | `hermad never picks models for you: what you choose here is what gets used.` |

- Ninguna opción viene preseleccionada con un modelo concreto (FR-4.3). El cursor arranca en la primera opción pero **enter sin elegir no está permitido**: clack `select` exige elegir; si el usuario quiere el default del vendor, lo elige explícitamente ("Dejar el modelo por defecto…") → guarda `modelFlag: ""`.
- La lista sale de `modelsFor(kind)`. Si la consulta tarda, spinner `Consultando modelos de {vendor}…` / `Fetching {vendor} models…`; si falla → solo "Otro" y "Dejar el default", más aviso `Aviso: no pude listar modelos de {vendor}; escribe uno o deja el default.` / `Warning: couldn't list {vendor} models; type one or keep the default.`
- **hermes** (sin catálogo): `text` libre: `Flag de modelo para hermes (puede quedar vacío)` / `Model flag for hermes (can be empty)`; vacío es válido.

---

## 5. Paso 4 — Skills

Una **skill** es un conjunto de instrucciones que mejora a un agente en una tarea. Este paso propone cuáles activar. Es **saltable** (FR-2.5): un setup con cero skills propias es válido y no genera avisos.

### 5.1 Entrada: ¿descubrir o saltar?

```
◆  Skills
│  Puedo buscar las skills que ya tienes instaladas y proponerte cuáles
│  activar para tu equipo. No instalo ni descargo nada.
│  ● Buscar y proponer   ○ Saltar este paso
└
```

| clave | es | en |
|---|---|---|
| `skills.intro` | `Puedo buscar las skills que ya tienes instaladas y proponerte cuáles activar para tu equipo. No instalo ni descargo nada.` | `I can look for the skills you already have installed and suggest which ones to enable for your team. I don't install or download anything.` |
| `skills.go` / `skip` | `Buscar y proponer` / `Saltar este paso` | `Search and suggest` / `Skip this step` |
| `skills.scanning` | `Indexando skills instaladas…` | `Indexing installed skills…` |
| `skills.none` | `No encontré skills instaladas. Seguimos sin ellas; tu equipo funciona igual.` | `I found no installed skills. We'll continue without them; your team works the same.` |

Saltar → `globalSkills: []`, sin avisos, el resumen lo dice ("Skills: ninguna").

### 5.2 Consentimiento antes de enviar a un LLM (FR-2.4, NFR-5)

Solo si encontró skills y hay vendor. **Default = No.**

```
▲  Antes de seguir: ¿enviar descripciones a un modelo?
│
│  Para recomendarte mejor puedo pedirle a {vendor} ({modelo}) que lea el nombre y
│  la descripción de tus skills y el nombre y el rol en una línea de cada persona.
│
│  Se enviaría:    el nombre y la descripción corta de cada skill, más el nombre y
│                  el rol en una línea de cada persona ({n} skills)
│  NO se enviaría: el contenido de las skills, tus archivos ni tus proyectos
│  Destino:        {vendor}, con el modelo {modelo} que elegiste en el paso anterior
│
│  Si dices que no, uso un buscador local: la recomendación es menos fina,
│  pero no sale nada de tu equipo.
│
◆  ¿Enviar nombres y descripciones a {vendor}?
│  ○ Sí, enviar   ● No, usar el buscador local
└
```

| clave | es | en |
|---|---|---|
| `skills.consent.title` | `Antes de seguir: ¿enviar descripciones a un modelo?` | `Before we go on: send descriptions to a model?` |
| `skills.consent.body` | `Para recomendarte mejor puedo pedirle a {vendor} ({model}) que lea el nombre y la descripción de tus skills y el nombre y el rol en una línea de cada persona.` | `To recommend better I can ask {vendor} ({model}) to read your skill names and descriptions and each persona's name and one-line role.` |
| `skills.consent.sent` | `Se enviaría: el nombre y la descripción corta de cada skill, más el nombre y el rol en una línea de cada persona ({n} skills)` | `Would be sent: each skill's name and short description, plus each persona's name and one-line role ({n} skills)` |
| `skills.consent.notsent` | `NO se enviaría: el contenido de las skills, tus archivos ni tus proyectos` | `NOT sent: the skills' contents, your files or your projects` |
| `skills.consent.dest` | `Destino: {vendor}, con el modelo {model} que elegiste en el paso anterior` | `Destination: {vendor}, using the {model} model you chose in the previous step` |
| `skills.consent.no` | `Si dices que no, uso un buscador local: la recomendación es menos fina, pero no sale nada de tu equipo.` | `If you say no, I use a local matcher: suggestions are less precise, but nothing leaves your machine.` |
| `skills.consent.ask` | `¿Enviar nombres y descripciones a {vendor}?` | `Send names and descriptions to {vendor}?` |
| `skills.consent.yes` / `no` | `Sí, enviar` / `No, usar el buscador local` | `Yes, send` / `No, use the local matcher` |

- Si el modelo elegido fue "default del vendor", `{model}` se muestra como `el modelo por defecto de {vendor}` / `{vendor}'s default model`.
- Si el vendor del paso 3 es `hermes` o experimental, la pregunta se omite y se usa local (mensaje en `skills.consent.unavailable`: `Con {vendor} no hago recomendaciones remotas; uso el buscador local.` / `With {vendor} I don't make remote suggestions; using the local matcher.`).
- Falla del LLM → cae a local con aviso (§12.5), el paso no se corta.

### 5.3 Selección (multiselect)

Una sola pantalla de selección, **agrupada**: primero las globales, luego por persona. Dos `multiselect` seguidos, con título que explica el alcance.

**Globales** (todas las personas las cargan):

```
◆  Skills para todo el equipo  (espacio = marcar, enter = confirmar)
│  ◼ caveman       Modo de respuestas cortas
│  ◻ graphify      Mapa de conocimiento del código
│  ◻ …
└
```

**Por persona** (se muestra una vez por persona, solo si tiene sugerencias; se puede saltar con enter sin marcar):

```
◆  Skills solo para dev
│  ◼ code-review   Revisa diffs
│  ◻ simplify      Limpieza de código
└
```

| clave | es | en |
|---|---|---|
| `skills.global.title` | `Skills para todo el equipo (espacio = marcar, enter = confirmar)` | `Skills for the whole team (space = toggle, enter = confirm)` |
| `skills.persona.title` | `Skills solo para {persona}` | `Skills only for {persona}` |
| `skills.source.llm` | `Sugeridas por {vendor}` | `Suggested by {vendor}` |
| `skills.source.local` | `Sugeridas por el buscador local` | `Suggested by the local matcher` |
| `skills.hint.skip` | `Enter sin marcar nada = ninguna` | `Enter with nothing checked = none` |

Reglas de preselección:
- **Modo LLM:** se preseleccionan las que el modelo recomienda; el motivo (`reason`) se muestra como hint de la opción.
- **Modo local:** las **globales no se preseleccionan** (design §1.3: la lista instalada sin preselección); las **por persona** se preseleccionan solo si score ≥ umbral (top-5).
- Máximo 12 opciones visibles con scroll; si hay más de 40 skills, la lista global se limita a las 15 de mayor score y se avisa `Mostrando 15 de {n}. Puedes ajustar después con hermad skills global add/rm.` / `Showing 15 of {n}. Adjust later with hermad skills global add/rm.`.
- Cada opción: `nombre` + descripción truncada a una línea (≤ 60 col).
- Skills inexistentes en el vendor elegido se marcan `(no nativa: se cargará por ruta)` / `(not native: loaded by path)` — no se ocultan.

---

## 6. Paso 5 — Permisos ⚠️ APROBACIÓN DE DIEGO

> Esta pantalla es una **decisión de seguridad**. Va a Diego/orquestador antes del build (§6.5).

### 6.1 Qué necesita entender la persona usuaria (en una frase)

> Para trabajar sin interrumpirte, los agentes pueden correr **sin pedirte permiso** para leer, escribir y ejecutar comandos en tu computadora. Eso es muy cómodo y **también riesgoso**. Tú decides.

### 6.2 Pantalla de explicación (nota, sin pregunta todavía)

```
▲  Permisos de los agentes  — decisión importante
│
│  Tus agentes pueden trabajar de dos maneras:
│
│  A) Modo con permisos (recomendado)
│     Cada vez que un agente quiera ejecutar un comando o editar un archivo,
│     se detiene y te pregunta. Es lo más seguro.
│     Costo: el equipo se frena. Un agente en espera aparece como "blocked"
│     y no avanza hasta que lo atiendas en su panel. Con varios agentes
│     trabajando, tendrás que ir mirando los paneles.
│
│  B) Modo sin permisos (bypass)
│     Los agentes ejecutan comandos y modifican archivos SIN preguntarte.
│     Es rápido y no se detiene, pero un agente que se equivoque, o que siga
│     instrucciones maliciosas escondidas en un archivo o página que lea,
│     puede borrar o cambiar archivos, o ejecutar comandos en tu máquina, y
│     no te enterarás hasta después. Con este modo hermad no te protege.
│     Úsalo solo en una máquina o carpeta donde puedas perder el trabajo.
│
│  Puedes cambiarlo cuando quieras con:  hermad settings permissions
```

| clave | es | en |
|---|---|---|
| `perm.title` | `Permisos de los agentes — decisión importante` | `Agent permissions — important decision` |
| `perm.intro` | `Tus agentes pueden trabajar de dos maneras:` | `Your agents can work in two ways:` |
| `perm.prompt.head` | `A) Modo con permisos (recomendado)` | `A) Permission-prompt mode (recommended)` |
| `perm.prompt.body` | `Cada vez que un agente quiera ejecutar un comando o editar un archivo, se detiene y te pregunta. Es lo más seguro.` | `Every time an agent wants to run a command or edit a file, it stops and asks you. This is the safest option.` |
| `perm.prompt.cost` | `Costo: el equipo se frena. Un agente en espera aparece como "blocked" y no avanza hasta que lo atiendas en su panel. Con varios agentes trabajando, tendrás que ir mirando los paneles.` | `Cost: the team slows down. A waiting agent shows as "blocked" and doesn't move until you answer in its pane. With several agents working, you'll need to keep checking the panes.` |
| `perm.bypass.head` | `B) Modo sin permisos (bypass)` | `B) No-permission mode (bypass)` |
| `perm.bypass.body` | `Los agentes ejecutan comandos y modifican archivos SIN preguntarte. Es rápido y no se detiene, pero un agente que se equivoque, o que siga instrucciones maliciosas escondidas en un archivo o página que lea, puede borrar o cambiar archivos, o ejecutar comandos en tu máquina, y no te enterarás hasta después. Con este modo hermad no te protege. Úsalo solo en una máquina o carpeta donde puedas perder el trabajo.` | `Agents run commands and modify files WITHOUT asking you. It's fast and never stops, but an agent that makes a mistake, or follows malicious instructions hidden in a file or web page it reads, can delete or change files or run commands on your machine, and you won't know until afterward. In this mode hermad does not protect you. Use it only on a machine or folder where losing work is acceptable.` |
| `perm.change` | `Puedes cambiarlo cuando quieras con: hermad settings permissions` | `You can change it any time with: hermad settings permissions` |

Se muestra **sin recortar** (no es colapsable): es el único consentimiento informado del flujo. En `readline` se imprime igual, completo.

### 6.3 Pregunta 1 — elegir modo (default = con permisos)

```
◆  ¿Qué modo quieres?
│  ● Con permisos — los agentes me preguntan  (recomendado)
│  ○ Sin permisos (bypass) — los agentes no preguntan
└
```

| clave | es | en |
|---|---|---|
| `perm.ask` | `¿Qué modo quieres?` | `Which mode do you want?` |
| `perm.opt.prompt` | `Con permisos — los agentes me preguntan (recomendado)` | `With permissions — agents ask me (recommended)` |
| `perm.opt.bypass` | `Sin permisos (bypass) — los agentes no preguntan` | `No permissions (bypass) — agents don't ask` |

El cursor arranca en **Con permisos**. Escape/Ctrl-C = cancelar el setup completo (no equivale a ninguna de las opciones).

### 6.4 Pregunta 2 — aceptación explícita (solo si eligió bypass)

La aceptación NO es un solo enter: es una pregunta aparte, default **No**, que repite lo esencial.

```
▲  Confirma que entiendes el riesgo
│  Elegiste el modo SIN permisos. Los agentes podrán ejecutar comandos y
│  modificar archivos de tu computadora sin preguntarte.
│
◆  ¿Aceptas ese riesgo?
│  ○ Sí, lo acepto   ● No, prefiero el modo con permisos
└
```

| clave | es | en |
|---|---|---|
| `perm.confirm.title` | `Confirma que entiendes el riesgo` | `Confirm you understand the risk` |
| `perm.confirm.body` | `Elegiste el modo SIN permisos. Los agentes podrán ejecutar comandos y modificar archivos de tu computadora sin preguntarte.` | `You chose the NO-permissions mode. Agents will be able to run commands and modify files on your computer without asking you.` |
| `perm.confirm.ask` | `¿Aceptas ese riesgo?` | `Do you accept that risk?` |
| `perm.confirm.yes` / `no` | `Sí, lo acepto` / `No, prefiero el modo con permisos` | `Yes, I accept` / `No, I prefer permission-prompt mode` |

Resultados:
- "Sí, lo acepto" → `permissions: { mode: "bypass", acceptedAt: <iso> }`.
- "No" (default) → `permissions: { mode: "prompt", acceptedAt: null }` y mensaje `Quedas en modo con permisos. Puedes cambiarlo luego con hermad settings permissions.` / `You're in permission-prompt mode. Change it later with hermad settings permissions.`
- Rechazar (en la pregunta 1 o 2) nunca produce error ni bloquea el setup: es un camino normal (FR-5.2).

### 6.5 Decisiones que se llevan a Diego/orquestador (aprobar o ajustar)

| # | Propuesta de ux | Alternativa |
|---|---|---|
| D1 | Aceptación = select + confirm separado (2 pasos, default No en ambos). | Pedir escribir la palabra `bypass` para aceptar (más fricción, más intencional). |
| D2 | El texto de riesgo menciona explícitamente **inyección de instrucciones** (instrucciones maliciosas en archivos/páginas) además del error del agente. | Solo "error del agente". |
| D3 | Texto sobre el costo del modo con permisos: agentes `blocked` hasta que el humano atienda el panel (design §4). | Omitir (no recomendado: la persona se sorprendería). |
| D4 | **Legacy** (design §4): config sin `permissions` → `bypass` + aviso de una línea en `start-team`. Copy propuesto en §11.2. | Forzar `prompt` también a las configs viejas. |
| D5 | Override por proyecto (`project.json → permissions`): **fuera del wizard**, solo por `settings permissions --project`. | Preguntarlo en el wizard. |
| D6 | `--yes` **nunca** implica bypass; solo `--accept-bypass` lo activa (requisito de design §4). | — (no negociable según design). |

---

## 7. Paso 6 — BMad (opcional)

BMad es un método de trabajo con agentes (planificar → especificar → construir → revisar). Hermad **funciona sin él**: las personas traen el método embebido. Este paso solo guarda una preferencia; no instala nada ahora (la instalación ocurre por proyecto en `create-project`, design §2).

```
◆  BMad (opcional)
│  BMad es un método con skills y plantillas que enriquece a tus agentes.
│  Tu equipo funciona sin él. Si quieres, lo instalo en cada proyecto nuevo
│  que crees con hermad create-project (en {idioma}).
│  ○ Sí, instalarlo en proyectos nuevos   ● No, por ahora
└
```

| clave | es | en |
|---|---|---|
| `bmad.title` | `BMad (opcional)` | `BMad (optional)` |
| `bmad.body` | `BMad es un método con skills y plantillas que enriquece a tus agentes. Tu equipo funciona sin él. Si quieres, lo instalo en cada proyecto nuevo que crees con hermad create-project (en {language}).` | `BMad is a method with skills and templates that enriches your agents. Your team works without it. If you like, I'll install it in every new project you create with hermad create-project (in {language}).` |
| `bmad.yes` / `no` | `Sí, instalarlo en proyectos nuevos` / `No, por ahora` | `Yes, install in new projects` / `Not for now` |
| `bmad.later` | `Puedes instalarlo cuando quieras con create-project --run-bmad-install.` | `You can install it any time with create-project --run-bmad-install.` |

- Default **No** (BMad descarga paquetes vía `npx`; es una acción con red, no una por defecto).
- Idioma de BMad = el elegido en el paso 1 (no se pregunta de nuevo).
- Si el usuario ya tiene `_bmad/` en el cwd: no se pregunta; nota `Detecté BMad en esta carpeta; lo uso.` / `Detected BMad in this folder; using it.` y `autoInstall` queda sin cambios.

---

## 8. Paso 7 — Resumen antes de aplicar

Es el **único** punto de "no vuelta atrás": hasta aquí no se escribió nada. Lista exacta de lo que se va a tocar (usa `pack.plan()` y los `plan()` de config/completion).

```
◇  Esto es lo que voy a hacer
│
│  Configuración  (~/.hermad/config.json)
│    idioma ............ español
│    vendors ........... claude (todas las personas) · modelo: sonnet
│    permisos .......... con permisos
│    skills globales ... caveman, graphify
│    BMad .............. no por ahora
│
│  Archivos que crearé o actualizaré
│    ~/.hermad/pack/                         (copia de los archivos base)
│    ~/.claude/skills/herdr-bmad  → pack     (enlace)
│    ~/.claude/commands/hermad.md → pack     (enlace)
│    ~/.config/opencode/…         → pack     (enlace)
│
│  No tocaré: ~/.hermes (hermes no está instalado), tus skills, tus proyectos
│
◆  ¿Aplico estos cambios?
│  ● Sí, aplicar   ○ No, salir sin cambios
└
```

| clave | es | en |
|---|---|---|
| `summary.title` | `Esto es lo que voy a hacer` | `This is what I'm about to do` |
| `summary.config` | `Configuración` | `Configuration` |
| `summary.files` | `Archivos que crearé o actualizaré` | `Files I'll create or update` |
| `summary.untouched` | `No tocaré: {lista}` | `I won't touch: {list}` |
| `summary.link` / `copy` | `(enlace)` / `(copia)` | `(link)` / `(copy)` |
| `summary.relink.replace` | `reemplaza un enlace antiguo que apuntaba a {ruta}` | `replaces an old link that pointed to {path}` |
| `summary.skipped.foreign` | `Dejo intacto {ruta}: ya existe y no es de hermad` | `Leaving {path} untouched: it exists and isn't hermad's` |
| `summary.ask` | `¿Aplico estos cambios?` | `Apply these changes?` |
| `summary.yes` / `no` | `Sí, aplicar` / `No, salir sin cambios` | `Yes, apply` / `No, exit without changes` |

- Los `~` se muestran como rutas reales del usuario si caben en 76 columnas; si no, se abrevian con `~`.
- Si el pack no cambia (idempotencia, A9): `Nada que cambiar: tu instalación ya está al día.` / `Nothing to change: your installation is already up to date.` y se salta al paso 9.
- "No, salir sin cambios" → mismo mensaje que cancelar (§12.7). Sin escribir nada.

---

## 9. Paso 8 — Aplicar (progreso)

Spinners con etiqueta, uno por acción, en este orden. Ante cualquier fallo se detiene y se explica (§12.6).

```
◇  Aplicando…
│  ✔ Pack base copiado a ~/.hermad/pack
│  ✔ Enlaces creados (4)
│  ✔ Configuración guardada
```

| clave | es | en |
|---|---|---|
| `apply.pack` | `Copiando el pack base…` → `Pack base copiado a {ruta}` | `Copying the base pack…` → `Base pack copied to {path}` |
| `apply.links` | `Creando enlaces…` → `Enlaces creados ({n})` | `Creating links…` → `Links created ({n})` |
| `apply.config` | `Guardando configuración…` → `Configuración guardada` | `Saving configuration…` → `Configuration saved` |
| `apply.nochange` | `Sin cambios` | `No changes` |

- Pack y config se escriben vía archivo temporal + `rename` (FR-3.6): si algo se interrumpe, el estado anterior sigue intacto.
- Ctrl-C **durante** apply: el spinner termina la operación atómica en curso (no deja medias escrituras) y luego sale con §12.7.

---

## 10. Paso 9 — Listo + completion + próximos pasos

### 10.1 Oferta de completion (opcional; default No)

Se muestra el archivo y el cambio **antes** de preguntar (FR-6.5/6.6; `completion/install.js plan()`).

```
◆  Completar comandos con TAB
│  Puedo activar el autocompletado de hermad en tu shell (zsh). Haría esto:
│    · crear ~/.zfunc/_hermad
│    · añadir un bloque marcado (# >>> hermad >>>) a ~/.zshrc
│  Se puede deshacer con: hermad completion uninstall
│  ○ Sí, activarlo   ● No, gracias
└
```

| clave | es | en |
|---|---|---|
| `completion.title` | `Completar comandos con TAB` | `Tab-complete commands` |
| `completion.body` | `Puedo activar el autocompletado de hermad en tu shell ({shell}). Haría esto:` | `I can enable hermad tab-completion in your shell ({shell}). I would:` |
| `completion.create` | `crear {ruta}` | `create {path}` |
| `completion.block` | `añadir un bloque marcado (# >>> hermad >>>) a {ruta}` | `add a marked block (# >>> hermad >>>) to {path}` |
| `completion.undo` | `Se puede deshacer con: hermad completion uninstall` | `Undo with: hermad completion uninstall` |
| `completion.yes` / `no` | `Sí, activarlo` / `No, gracias` | `Yes, enable it` / `No, thanks` |
| `completion.reload` | `Abre una terminal nueva (o ejecuta: {cmd}) para que funcione.` | `Open a new terminal (or run: {cmd}) for it to take effect.` |
| `completion.ps.restricted` | `PowerShell tiene ExecutionPolicy Restricted: no toqué tu perfil. Cuando lo cambies, ejecuta hermad completion install.` | `PowerShell's ExecutionPolicy is Restricted: I didn't touch your profile. Once you change it, run hermad completion install.` |
| `completion.noshell` | `No reconocí tu shell. Usa: hermad completion <zsh\|bash\|fish\|powershell>` | `I didn't recognize your shell. Use: hermad completion <zsh\|bash\|fish\|powershell>` |

### 10.2 Pantalla final (outro)

```
└  Listo. Tu hermad está configurado.

◇  Próximos pasos
│  1. Crea un proyecto:      hermad create-project mi-app
│  2. Abre tu equipo:        cd mi-app && hermad start-team
│  3. Pídele algo al equipo: /hermad construye …
│
│  Permisos: con permisos (los agentes te preguntarán; mira los paneles
│            "blocked").   Cámbialo con: hermad settings permissions
│  Más ayuda: hermad --help
```

| clave | es | en |
|---|---|---|
| `done.outro` | `Listo. Tu hermad está configurado.` | `Done. hermad is set up.` |
| `done.next.title` | `Próximos pasos` | `Next steps` |
| `done.next.1` | `Crea un proyecto: hermad create-project mi-app` | `Create a project: hermad create-project my-app` |
| `done.next.2` | `Abre tu equipo: cd mi-app && hermad start-team` | `Open your team: cd my-app && hermad start-team` |
| `done.next.3` | `Pídele algo al equipo: /hermad <lo que necesitas>` | `Ask the team for something: /hermad <what you need>` |
| `done.perm.prompt` | `Permisos: con permisos (los agentes te preguntarán; mira los paneles "blocked"). Cámbialo con: hermad settings permissions` | `Permissions: permission-prompt mode (agents will ask you; watch for "blocked" panes). Change with: hermad settings permissions` |
| `done.perm.bypass` | `Permisos: SIN permisos (bypass), aceptado el {fecha}. Cámbialo con: hermad settings permissions prompt` | `Permissions: NO permissions (bypass), accepted on {date}. Change with: hermad settings permissions prompt` |
| `done.herdr.pending` | `Antes de start-team instala herdr: {cmd}` | `Before start-team, install herdr: {cmd}` |
| `done.help` | `Más ayuda: hermad --help` | `More help: hermad --help` |

- Si `herdr` quedó sin instalar, el paso 2 de "Próximos pasos" se antepone con `done.herdr.pending`.
- Si BMad = sí: línea extra `Los proyectos nuevos instalarán BMad en {idioma}.` / `New projects will install BMad in {language}.`

---

## 11. Flujo `update`

Entrada: `hermad update`. Es un flujo corto con una sola confirmación.

```
┌  hermad update
│
◇  Instalación detectada: npm global
│  Versión actual:      0.4.0
│  Versión disponible:  0.5.0
│
◆  ¿Actualizar ahora?
│  ● Sí, actualizar   ○ No
└
◇  Actualizando…
│  ✔ hermad 0.5.0 instalado
│  ✔ Pack base actualizado y enlaces revisados
└  Listo. Todo está al día.
```

| clave | es | en |
|---|---|---|
| `update.method` | `Instalación detectada: {método}` (`npm global` / `clone git` / `desconocida`) | `Detected installation: {method}` (`npm global` / `git clone` / `unknown`) |
| `update.current` / `available` | `Versión actual: {v}` / `Versión disponible: {v}` | `Current version: {v}` / `Available version: {v}` |
| `update.uptodate` | `Ya tienes la última versión ({v}). Reviso el pack por si faltan enlaces…` | `You already have the latest version ({v}). Checking the pack for missing links…` |
| `update.ask` | `¿Actualizar ahora?` | `Update now?` |
| `update.yes` / `no` | `Sí, actualizar` / `No` | `Yes, update` / `No` |
| `update.git.will` | `Voy a ejecutar: git pull --ff-only y npm install --omit=dev en {ruta}.` | `I'll run: git pull --ff-only and npm install --omit=dev in {path}.` |
| `update.npm.will` | `Voy a ejecutar: npm install -g github:DdeDiegoA/hermad` | `I'll run: npm install -g github:DdeDiegoA/hermad` |
| `update.relink` | `Pack base actualizado y enlaces revisados` | `Base pack updated and links checked` |
| `update.done` | `Listo. Todo está al día.` | `Done. Everything is up to date.` |

- Siempre se muestra el **comando exacto** antes de la confirmación (`update.git.will` / `update.npm.will`).
- **Versión disponible no consultable** (sin red, GitHub caído; timeout 5 s): `Aviso: no pude ver la versión disponible. ¿Actualizo igual?` / `Warning: couldn't check the available version. Update anyway?` (misma pregunta, default Sí; no bloquea).
- **Método desconocido** (FR-7.4): no pregunta; imprime y sale con código 0:
  ```
  ▲  No pude determinar cómo instalaste hermad.
  │  Actualiza a mano con uno de estos dos comandos:
  │    npm install -g github:DdeDiegoA/hermad        (instalación npm global)
  │    git -C <carpeta del repo> pull --ff-only       (clone git)
  │  Después ejecuta: hermad setup --relink-only
  ```
  es | en: `No pude determinar cómo instalaste hermad. Actualiza a mano con uno de estos dos comandos:` / `I couldn't tell how you installed hermad. Update manually with one of these two commands:`
- **`git` ausente** (npm global necesita `git` para instalar desde GitHub): `Error: npm necesita git para instalar desde GitHub y no lo encuentro. Instala git y repite hermad update.` / `Error: npm needs git to install from GitHub and I can't find it. Install git and run hermad update again.`
- **Clone con cambios locales** que impidan `--ff-only`: `Error: git pull --ff-only falló (tienes cambios o ramas divergentes). No modifiqué nada. Resuélvelo en {ruta} y repite hermad update.` / `Error: git pull --ff-only failed (local changes or diverged branches). I changed nothing. Resolve it in {path} and run hermad update again.`
- Cancelar (No / Ctrl-C) antes de ejecutar: `Sin cambios.` / `No changes.` exit 130 (Ctrl-C) o 0 (No).
- Tras `npm-global`, el relink lo hace el binario nuevo (`setup --relink-only`, flag interno); el usuario no lo ve, solo el spinner `Pack base actualizado y enlaces revisados`.

### 11.1 `hermad settings permissions` ⚠️ (misma aprobación que §6)

```
$ hermad settings permissions
◇  Permisos actuales: con permisos
◆  ¿Qué modo quieres?   (misma pantalla y textos de §6.3)
```

- Sin argumento → muestra el estado actual y abre la pregunta §6.3 (en TTY). `hermad settings permissions prompt` aplica sin preguntar (bajar de riesgo no necesita confirmación). `hermad settings permissions bypass` **repite la pantalla §6.2 y la confirmación §6.4** (o requiere `--accept-bypass`).
- Aviso al cambiar: `Los agentes ya abiertos conservan el modo anterior. Cierra y vuelve a abrir el equipo (start-team) para aplicar el cambio.` / `Agents that are already open keep the previous mode. Close and reopen the team (start-team) for the change to apply.`
- Flag `--project`: aplica solo al proyecto actual (`project.json → permissions`); la salida lo dice: `Aplicado solo a este proyecto.` / `Applied to this project only.`

### 11.2 Aviso legacy en `start-team` (decisión D4)

Una línea, hasta que el modo se fije explícitamente:

| es | en |
|---|---|
| `Aviso: tus agentes arrancan SIN permisos (bypass) porque tu configuración es anterior a esta opción. Para confirmarlo o cambiarlo: hermad settings permissions` | `Warning: your agents start with NO permissions (bypass) because your configuration predates this option. To confirm or change it: hermad settings permissions` |

---

## 12. Estados de error y cancelación

Formato común de error (clack `log.error` / texto plano en headless): `Error: <qué pasó>. <por qué importa / qué no se tocó>. <siguiente paso>.` Todo a **stderr** salvo la salida normal. Códigos de salida: `0` ok · `1` error · `2` falta input en no-TTY (`NeedsInput`) · `130` cancelado por el usuario.

### 12.1 Node demasiado viejo (único mensaje bilingüe)

Se evalúa **antes** de cargar clack y de cualquier import dinámico (la comprobación vive en `bin/` con sintaxis vieja-segura):

```
Error: hermad necesita Node 20.12 o superior (tienes {v}).
       Actualiza Node (https://nodejs.org) y repite: hermad setup
Error: hermad needs Node 20.12 or newer (you have {v}).
       Update Node (https://nodejs.org) and run again: hermad setup
```

Exit 1. No se escribe nada.

### 12.2 Sin ningún vendor

```
✖  No encontré ningún vendor de IA instalado
│  hermad necesita al menos uno para correr tus agentes. Busqué: claude,
│  opencode, hermes (y los experimentales codex, gemini).
│  Instala uno y repite:  hermad setup
│    claude    →  https://claude.com/claude-code
│    opencode  →  https://opencode.ai
```

| clave | es | en |
|---|---|---|
| `err.novendor.title` | `No encontré ningún vendor de IA instalado` | `I found no AI vendor installed` |
| `err.novendor.body` | `hermad necesita al menos uno para correr tus agentes. Busqué: {lista}.` | `hermad needs at least one to run your agents. I looked for: {list}.` |
| `err.novendor.next` | `Instala uno y repite: hermad setup` | `Install one and run again: hermad setup` |

Exit 1, sin tocar disco. (En headless: mismo mensaje por stderr.)

### 12.3 `herdr` ausente

No aborta el setup (§3.2). Se recuerda en el outro (`done.herdr.pending`) y, más tarde, `start-team` sin herdr muestra: `Error: no encontré herdr, que es necesario para abrir el equipo. Instálalo ({cmd}) y repite hermad start-team.` / `Error: I can't find herdr, which is required to open the team. Install it ({cmd}) and run hermad start-team again.`

### 12.4 `@clack/prompts` no carga (clone sin `npm install`)

No es un error para la persona usuaria: cae al adaptador `readline` con un aviso de una línea y el mismo contenido (listas numeradas):

| es | en |
|---|---|
| `Aviso: no pude cargar la interfaz moderna (falta npm install). Sigo en modo simple.` | `Warning: couldn't load the modern interface (npm install is missing). Continuing in simple mode.` |

En `readline`: selecciones por número (`1) …  2) …  Elige [1]:`), multiselect por lista de números separados por coma (`Elige números separados por comas, enter = ninguno:` / `Enter numbers separated by commas, empty = none:`), confirm `s/N` en es y `y/N` en en (la mayúscula indica el default). El default de cada pregunta de riesgo es el mismo que en clack (No).

### 12.5 El LLM de sugerencias falla → local

No corta el paso. Aviso y se sigue con el buscador local:

| es | en |
|---|---|
| `Aviso: {vendor} no respondió ({motivo corto}). Uso el buscador local; la lista puede ser menos precisa.` | `Warning: {vendor} didn't respond ({short reason}). Using the local matcher; suggestions may be less precise.` |

### 12.6 Falla durante apply

```
✖  Error al crear los enlaces
│  No pude escribir {ruta}: {motivo}.
│  Estado: el pack anterior y tu configuración siguen intactos
│          (o: el pack nuevo está copiado, la configuración no se guardó).
│  Siguiente: corrige el permiso de esa carpeta y repite hermad setup
│  (se puede repetir sin riesgo; no duplica nada).
```

| clave | es | en |
|---|---|---|
| `err.apply.title` | `Error al {acción}` | `Error while {action}` |
| `err.apply.body` | `No pude escribir {ruta}: {motivo}.` | `I couldn't write {path}: {reason}.` |
| `err.apply.state.safe` | `Estado: el pack anterior y tu configuración siguen intactos.` | `State: your previous pack and configuration are intact.` |
| `err.apply.state.partial` | `Estado: el pack nuevo está copiado, pero la configuración no se guardó.` | `State: the new pack is copied, but your configuration wasn't saved.` |
| `err.apply.next` | `Siguiente: corrige el permiso de esa carpeta y repite hermad setup (es seguro repetirlo: no duplica nada).` | `Next: fix that folder's permissions and run hermad setup again (safe to repeat: nothing gets duplicated).` |

Exit 1. En Windows, si el symlink falla por permisos, el fallback a copia es silencioso pero el resumen/outro lo dice (`(copia)`).

### 12.7 Cancelación (Ctrl-C / Esc)

| Momento | Qué pasa | Mensaje (es / en) | Exit |
|---|---|---|---|
| Pasos 1–7 (collect) o "No, salir" en el resumen | Nada se escribió | `Setup cancelado. No modifiqué nada. Puedes retomarlo con hermad setup.` / `Setup cancelled. I changed nothing. Resume any time with hermad setup.` | 130 (Ctrl-C) / 0 ("No, salir") |
| Paso 8 (apply) | Se completa la operación atómica en curso; el resto no se hace | `Setup interrumpido durante la aplicación. Tu pack y configuración anteriores siguen intactos; repite hermad setup para terminar.` / `Setup interrupted while applying. Your previous pack and configuration are intact; run hermad setup again to finish.` | 130 |
| Paso 9 (oferta de completion) | El setup ya terminó; solo se omite el completion | `Setup terminado. No activé el autocompletado; puedes hacerlo con hermad completion install.` / `Setup finished. I didn't enable tab-completion; you can with hermad completion install.` | 0 |
| `update`, antes de ejecutar | Nada cambió | `Sin cambios.` / `No changes.` | 130 |
| `update`, durante `npm install -g` | Lo corta el proceso hijo; el usuario debe revisar | `Actualización interrumpida. Verifica con hermad --version y repite hermad update si hace falta.` / `Update interrupted. Check with hermad --version and run hermad update again if needed.` | 130 |

Reglas:
- La cancelación es **siempre un camino limpio**: sin stack trace, sin "Error:".
- La cancelación en la pregunta de permisos **no** equivale a "con permisos"; cancela el setup (así nada se guarda por omisión, ni siquiera el modo seguro).
- Un segundo Ctrl-C durante apply no fuerza más cortes: el apply ya es atómico por archivo.

---

## 13. `--yes` / no-TTY

Aplica cuando se pasa `--yes` **o** `stdin` no es TTY (CI, pipes, `< /dev/null`). Adaptador `headless`: no pregunta nunca; usa el default de la tabla; si no hay default, aborta con `exit 2` y dice qué flag falta. **Nunca se cuelga** (A5).

> **`--yes` nunca implica bypass.** El único camino a bypass sin TTY es `--accept-bypass`, explícito. Un script con `--yes` solo queda siempre en modo con permisos.

| # | Paso | Con `--yes` / sin TTY | Flag que lo cambia | Si falta algo |
|---|---|---|---|---|
| 1 | Idioma | `--lang` o locale (`es*` → es, si no en) | `--lang es\|en` | — |
| 2 | Prerequisitos | Node viejo → abort (exit 1). `herdr` ausente → **aviso y sigue; no instala**. 0 vendors → abort (exit 1) | — | — |
| 3 | Vendors y modelo | 1 vendor → todas. Varios → reparto propuesto aplicado. Modelo: `--model <id>` en todas; sin él → `modelFlag: ""` (default del propio vendor) y se imprime `Aviso: sin --model, cada vendor usará su modelo por defecto.` / `Warning: no --model given; each vendor will use its own default model.` | `--model <id>` | — |
| 4 | Skills | Buscador **local**, **sin LLM** (privacidad por defecto). Preselecciona solo las por-persona sobre umbral; globales: ninguna. | `--llm-suggest` (consiente el envío), `--skip-skills` | — |
| 5 | Permisos ⚠️ | **Modo con permisos** (`prompt`). `acceptedAt: null` | `--accept-bypass` (solo así `bypass`) | — |
| 6 | BMad | `autoInstall: false` | — (`create-project --run-bmad-install` aparte) | — |
| 7 | Resumen | Se imprime (stdout) y se **aplica sin confirmar** | — | — |
| 8 | Aplicar | Igual que TTY (atómico) | `--skip-agents` (ya existe) | Error → exit 1 |
| 9 | Completion + próximos pasos | **No** instala completion. Imprime próximos pasos | `--completion` (sí instala) | — |

Salida headless: líneas de texto plano, una por acción, sin spinners ni símbolos de color (`[ok] Pack base copiado a ~/.hermad/pack`), a stdout; avisos y errores a stderr. Se imprime siempre al final una línea de estado de permisos (`done.perm.*`), para que un script/log deje constancia.

Mensajes de abort por input faltante (exit 2):

| es | en |
|---|---|
| `Error: falta información para continuar sin terminal: {clave}. Pásala con {flag} o corre hermad setup en una terminal interactiva.` | `Error: missing information to continue without a terminal: {key}. Pass it with {flag} or run hermad setup in an interactive terminal.` |

Casos que producen `NeedsInput` hoy: ninguno con los defaults de arriba (cada paso tiene default). Se deja el mensaje por si un paso futuro agrega una pregunta sin default.

Idempotencia (A9): `hermad setup --yes` repetido imprime `Nada que cambiar` y exit 0.

---

## 14. `hermad setup` repetido (config existente)

La persona vuelve a correr `hermad setup`. No se la trata como nueva:

- Al arrancar, nota: `Ya tienes una configuración (idioma: {l}, permisos: {m}). Los pasos arrancan con tus valores actuales; enter los conserva.` / `You already have a configuration (language: {l}, permissions: {m}). Each step starts with your current values; enter keeps them.`
- Cada select/multiselect preselecciona el valor guardado, **excepto permisos**: el paso 5 se muestra completo cada vez que el modo actual es `bypass` o `acceptedAt` es nulo con config legacy (decisión D4), pero con el cursor en el valor actual; si el modo actual es `prompt`, se muestra igual y arranca en `prompt`.
- Nunca se pisan `globalSkills` ni claves desconocidas (merge de `config.save`).
- El resumen (§8) muestra solo lo que **cambia**; si no hay diferencias → `Nada que cambiar`.

---

## 15. Checklist de implementación (para dev/pm)

- Todas las cadenas viven en `src/i18n/{es,en}.js` bajo las claves de este documento; un test verifica que `es` y `en` tienen **exactamente las mismas claves** (paridad).
- Ninguna pantalla de riesgo (permisos, consentimiento LLM, ejecutar instalador de herdr, tocar rc) tiene `initialValue` en Sí.
- Test del adaptador `headless`: cada paso resuelve con stdin cerrado, `--yes` sin `--accept-bypass` ⇒ `permissions.mode === "prompt"` (A5; sin esto el gate de seguridad no se cierra).
- Test del paso de permisos (clack mockeado): Ctrl-C en las dos preguntas ⇒ cancelación del setup, 0 escrituras; "No" ⇒ `prompt`; solo "Sí, lo acepto" ⇒ `bypass` con `acceptedAt` ISO.
- Los textos de riesgo (§6.2) se imprimen **completos** en los tres adaptadores.
- Ancho: ninguna línea del wizard supera 76 columnas tras interpolar (las rutas largas se abrevian con `~` o `…` en el medio).

## 16. Fuera de alcance de este documento

Diseño visual más allá de lo que ofrece `@clack/prompts` (no hay tema propio); más idiomas que es/en; telemetría; instalación de vendors; edición de personas dentro del wizard (eso es `hermad settings agents`).
