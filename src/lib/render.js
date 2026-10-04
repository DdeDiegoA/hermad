"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const prompts = require("./prompts");
const memory = require("./memory");
const skills = require("./skills");
const config = require("./config");

// Render por proyecto de los artefactos de cada persona (D2). Fuente de verdad:
// templates/. Salida en .hermad/generated/ y .opencode/agents/ (gitignored).
const GEN_DIR = path.join(".hermad", "generated");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const warnedMissing = new Set();
function warnOnce(key, msg) {
  if (warnedMissing.has(key)) return;
  warnedMissing.add(key);
  console.log(msg);
}
const warnedLegacy = { done: false };

// Modo de permisos: override del proyecto (project.json → permissions, string u
// objeto) > config global > "prompt". orchestrator/plan-devs llaman render SIN
// `project`: ahí se lee .hermad/project.json de sourceDir (repo principal) o de
// projectDir. Única resolución; startPlan solo mira artifacts.permissions (FR-5.3).
function permissionsModeOf(perms) {
  return typeof perms === "string" ? perms : perms && perms.mode;
}

function projectPermissions(dir) {
  try {
    return permissionsModeOf(JSON.parse(fs.readFileSync(path.join(dir, ".hermad", "project.json"), "utf8")).permissions);
  } catch {
    return undefined;
  }
}

function resolvePermissions({ project, sourceDir, projectDir }) {
  return (
    permissionsModeOf(project && project.permissions) ??
    projectPermissions(sourceDir) ??
    projectPermissions(projectDir) ??
    permissionsModeOf(config.load().permissions) ??
    "prompt"
  );
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// Windows no admite ':' ni otros caracteres en un nombre de carpeta: los ids de
// skill namespaceados ("plugin:skill") se aplanan a un nombre de path legal. Se
// aplica en todas las plataformas para que el artefacto sea idéntico en cualquier OS.
// El nombre con el que claude expone la skill sale del frontmatter `name` del
// SKILL.md (la carpeta es solo fallback), así que renombrarla no la afecta.
function safeSkillDir(name) {
  return String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/[. ]+$/, "") || "_";
}

// Two distinct ids can flatten to the same folder ("superpowers:tdd" vs
// "superpowers-tdd"): without disambiguating, the second symlink silently
// overwrites the first. Give EVERY colliding folder a hash suffix (stable,
// order-independent); a unique name keeps its clean folder.
function skillFolders(names) {
  const safe = names.map(safeSkillDir);
  const counts = new Map();
  for (const s of safe) counts.set(s, (counts.get(s) || 0) + 1);
  return names.map((n, i) => {
    if (counts.get(safe[i]) < 2) return safe[i];
    return `${safe[i]}-${crypto.createHash("sha1").update(n).digest("hex").slice(0, 6)}`;
  });
}

function linkSkill(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  try {
    fs.symlinkSync(src, dest, process.platform === "win32" ? "junction" : "dir"); // junction: sin admin en Windows
  } catch {
    fs.cpSync(src, dest, { recursive: true });
  }
}

function splitModelFlags(modelFlag) {
  return Array.isArray(modelFlag) ? modelFlag : (modelFlag || "").split(" ").filter(Boolean);
}

// modelFlag p.ej. "-m provider/model" o "--model sonnet" → "provider/model"
function modelIdFrom(modelFlag) {
  const flags = splitModelFlags(modelFlag);
  const i = flags.findIndex((f) => f === "-m" || f === "--model");
  return i >= 0 ? flags[i + 1] : null;
}

// "es" → Spanish, resto → English. Gobierna la línea de comunicación (FR-3.5).
function languageName(lang) {
  return String(lang || "").toLowerCase().startsWith("es") ? "Spanish" : "English";
}

// Placeholders de plantillas (`{{user}}`, `{{language}}`). Lo usan renderPersona
// y (para AGENTS-template.md) create-project, así no hay strings del autor (FR-1.5).
function applyPlaceholders(text, { user = "the user", language = "English" } = {}) {
  if (!text) return text;
  return text.replace(/\{\{user\}\}/g, user).replace(/\{\{language\}\}/g, language);
}

// Fuente de una skill resuelta, para decidir si el vendor la carga de forma nativa
// (proyecto primero, igual que skills.resolve). "claude-plugin" = cache de plugins.
function skillSource(dir, sourceDir) {
  for (const r of [...skills.projectRoots(sourceDir), ...skills.globalRoots()]) {
    if (dir === r.dir || dir.startsWith(r.dir + path.sep)) return r.source;
  }
  return "unknown";
}

// Qué fuentes ve cada vendor de forma nativa (matriz §6 de docs/vendors.md).
// claude symlinkea CUALQUIER fuente en el plugin; hermes solo sus roots; opencode
// las de sus roots (incl. ~/.claude/skills); codex/gemini ninguna.
const NATIVE_SOURCES = {
  opencode: new Set(["claude", "opencode", "agents", "project"]),
  hermes: new Set(["hermes"]),
};

function nativeFor(kind, source) {
  if (kind === "claude") return true;
  const set = NATIVE_SOURCES[kind];
  return set ? set.has(source) : false;
}

// Bloque que le dice al agente que lea esos SKILL.md con su herramienta: así una
// skill de tarea sirve sin depender del tool Skill ni de recarga en caliente.
function taskSkillsBlock(paths) {
  if (!paths || !paths.length) return "";
  return ["## Task skills — read these SKILL.md before starting", ...paths.map((p) => `- ${p}`)].join("\n");
}

// Claude Code's subagent launcher tool es `Agent` (versiones viejas: `Task`). En
// hermad el trabajo se delega a un peer de otro vendor (más barato), no a un
// subagente interno: se niega la tool en el settings de claude y se le dice al
// agente qué hacer en su lugar.
const CLAUDE_DELEGATION_RULE = [
  "## Delegation & cost (Claude)",
  "Internal subagents are DISABLED (`Agent`/`Task` are denied) — never try to spawn one.",
  "To delegate, hand off to a peer: `hermad send <peer> \"...\"`.",
  "For bulk or low-stakes work, ask the orquestador to open a cheaper-vendor worker:",
  "`hermad spawn <persona> [--name <agent>] --kind <vendor> [--model <id>]` (e.g. `--kind opencode`, `--kind codex`).",
].join("\n");

// sourceDir = de dónde se lee la memoria (AGENTS.md + journal) y las skills. En
// un worktree projectDir=wtDir (salida del agente) pero sourceDir=repo principal.
function renderPersona({ projectDir, sourceDir = projectDir, name, agentName, persona, compactPct = 50, extraSkills = [], project, globs, config: cfg }) {
  const agentKey = agentName || name;
  // Una persona sin vendor elegido no puede arrancar: el default del fuente está
  // vacío a propósito (FR-4.5); el usuario lo fija en `hermad setup`.
  if (!persona || !persona.kind) {
    throw new Error(`persona '${name}' sin vendor configurado — corré 'hermad setup' (o 'hermad settings agents')`);
  }
  const permissionMode = resolvePermissions({ project, sourceDir, projectDir });
  if (permissionMode === "bypass" && config.isLegacy() && !warnedLegacy.done) {
    warnedLegacy.done = true;
    console.log(config.LEGACY_BYPASS_WARNING);
  }
  const p = prompts.loadPersona(name) || { skills: [], optionalSkills: [], body: persona.rol || `You are the ${name} persona.` };
  const memBlock = memory.slice(sourceDir, { persona: name });

  // Idioma/usuario: placeholders `{{user}}`/`{{language}}` + línea fija de
  // comunicación (FR-1.5, FR-3.5). config inyectable en tests.
  const cfg2 = cfg || require("./config").load();
  const user = (cfg2.userName && String(cfg2.userName).trim()) || "the user";
  const language = languageName(cfg2.language);
  const body = applyPlaceholders(p.body, { user, language });

  // Allowlist = requeridas (frontmatter ∪ persona) ∪ optionalSkills PRESENTES
  // (las que faltan se ignoran en silencio) ∪ globales efectivas ∪ --skills.
  const required = [...new Set([...(p.skills || []), ...(persona.skills || [])].filter(Boolean))];
  const optional = [...new Set((p.optionalSkills || []).filter(Boolean))];
  const { found: optionalFound } = skills.resolveAll(optional, sourceDir);
  const effectiveGlobals = globs || skills.effectiveGlobals(project || {});
  const allow = [...new Set([...required, ...optionalFound.map((f) => f.name), ...effectiveGlobals, ...extraSkills].filter(Boolean))];
  const { found, missing } = skills.resolveAll(allow, sourceDir);
  const native = [];
  const byPath = [];
  for (const f of found) (nativeFor(persona.kind, skillSource(f.dir, sourceDir)) ? native : byPath).push(f);
  const taskBlock = taskSkillsBlock(byPath.map((f) => path.join(f.dir, "SKILL.md")));
  const kindBody = persona.kind === "claude" ? `${body}\n\n${CLAUDE_DELEGATION_RULE}` : body;
  const langLine = `Communicate with ${user} and write documents in ${language}.`;
  const baseBody = [kindBody, langLine, taskBlock].filter(Boolean).join("\n\n");
  // El prompt-por-archivo de claude/opencode NO lleva memoria: claude la recibe
  // por CLAUDE.md/@AGENTS.md + el hook, opencode por el AGENTS.md nativo. Solo el
  // fallback (hermes/codex/…) necesita el bloque atómico embebido.
  const promptFile = path.join(projectDir, GEN_DIR, "prompts", `${agentKey}.md`);
  write(promptFile, baseBody + "\n");
  const promptBody = [baseBody, memBlock].filter(Boolean).join("\n\n---\n\n");

  // opencode no tiene hook: recibe el journal embebido en su agente md. El
  // AGENTS.md solo se agrega si el nativo (projectDir) difiere del de sourceDir
  // —en un worktree es la copia vieja de HEAD— para no duplicarlo en el caso normal.
  const sameAgents =
    path.resolve(projectDir) === path.resolve(sourceDir) ||
    (() => {
      try {
        return fs.readFileSync(path.join(projectDir, "AGENTS.md"), "utf8") === fs.readFileSync(path.join(sourceDir, "AGENTS.md"), "utf8");
      } catch {
        return false;
      }
    })();
  const journalBlock = memory.slice(sourceDir, { persona: name, includeAgents: !sameAgents });
  const opencodeBody = [baseBody, journalBlock].filter(Boolean).join("\n\n---\n\n");

  for (const miss of missing) {
    if (warnedMissing.has(miss)) continue;
    warnedMissing.add(miss);
    console.log(`[!] skill '${miss}' no existe instalada — se omite (la allowlist no aborta)`);
  }

  // claude: plugin por agente (skills allowlist + hook de memoria) + settings.
  const pluginDir = path.join(projectDir, GEN_DIR, "claude", agentKey);
  const pluginSkills = path.join(pluginDir, "skills");
  fs.rmSync(pluginSkills, { recursive: true, force: true });
  const folders = skillFolders(found.map((f) => f.name));
  found.forEach((f, i) => linkSkill(f.dir, path.join(pluginSkills, folders[i])));
  write(
    path.join(pluginDir, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: `hermad-${agentKey}`, version: "0.0.1", description: `Hermad persona ${name}`, skills: "./skills/", hooks: "./hooks/hooks.json" }, null, 2) + "\n"
  );
  write(
    path.join(pluginDir, "hooks", "hooks.json"),
    JSON.stringify(
      { hooks: { SessionStart: [{ matcher: "startup|resume|clear|compact", hooks: [{ type: "command", command: `hermad memory slice ${name}`, timeout: 10 }] }] } },
      null,
      2
    ) + "\n"
  );
  // skipDangerousModePermissionPrompt: sin esto claude muestra un diálogo de
  // confirmación del modo bypass al arrancar y el agente queda blocked.
  const settings = {
    env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: String(compactPct), HERMAD_AGENT: agentKey },
    skipDangerousModePermissionPrompt: true,
  };
  // readonly: se niegan los writers directos; Bash de escritura queda documentado
  // en el prompt (los permisos de Bash no cubren `>` ni todos los writers).
  // Las skills permitidas llegan por el plugin (hermad-<persona>:<skill>). Las del
  // proyecto (p.ej. las 29 de BMad en .claude/skills/) las carga claude igual con
  // --setting-sources project, así que se niegan todas: la allowlist queda en el plugin.
  const deny = ["Agent", "Task", ...skills.listProjectClaude(projectDir, sourceDir).map((n) => `Skill(${n})`)];
  if (p.readonly) deny.push("Edit", "Write", "NotebookEdit", "Bash(sed -i:*)", "Bash(tee:*)", "Bash(dd:*)");
  settings.permissions = { deny };
  const settingsFile = path.join(projectDir, GEN_DIR, "claude", `${agentKey}.settings.json`);
  write(settingsFile, JSON.stringify(settings, null, 2) + "\n");

  // MCP por persona: el frontmatter `mcp:` nombra servidores definidos en
  // ~/.hermad/config.json (`mcpServers`). Solo claude los acota por proceso
  // (--mcp-config); en opencode/hermes los MCP son globales → se avisa una vez.
  let mcpFile = null;
  const wantedMcp = (p.mcp || []).filter(Boolean);
  if (wantedMcp.length) {
    const defs = cfg2.mcpServers || {};
    const picked = {};
    for (const n of wantedMcp) {
      if (defs[n]) picked[n] = defs[n];
      else warnOnce(`mcp:${n}`, `[!] mcp '${n}' (persona ${name}) no está en mcpServers de ~/.hermad/config.json — se omite`);
    }
    if (persona.kind === "claude" && Object.keys(picked).length) {
      mcpFile = path.join(projectDir, GEN_DIR, "claude", `${agentKey}.mcp.json`);
      write(mcpFile, JSON.stringify({ mcpServers: picked }, null, 2) + "\n");
    } else if (persona.kind !== "claude") {
      warnOnce(`mcp-kind:${name}:${persona.kind}`, `[!] ${name} pide MCP (${wantedMcp.join(", ")}) pero ${persona.kind} no los acota por persona — configuralos en ${persona.kind} o usá --kind claude`);
    }
  }

  // opencode: agente md (prompt por archivo + permisos de skill + readonly).
  const opencodeAgentName = `hermad-${agentKey}`;
  const agentFile = path.join(projectDir, ".opencode", "agents", `${opencodeAgentName}.md`);
  const skillPerms = { "*": "deny" };
  for (const { name: skillName } of native) skillPerms[skillName] = "allow";
  const front = {
    description: `${name} — ${persona.rol || "hermad persona"}`,
    mode: "primary",
    permission: { skill: skillPerms },
  };
  const modelId = modelIdFrom(persona.modelFlag);
  if (modelId) front.model = modelId;
  if (p.readonly) front.permission.edit = "deny";
  // En un agente md el cuerpo ES el system prompt (el campo `prompt` es solo para JSON).
  write(agentFile, `---\n${Object.entries(front).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n")}\n---\n\n${opencodeBody}\n`);

  return {
    promptFile,
    promptBody,
    permissions: permissionMode,
    // skillsFound = lo que el vendor carga nativo (hermes --skills, plugin claude).
    skillsFound: native.map((f) => f.name),
    skillsNative: native.map((f) => f.name),
    skillsByPath: byPath.map((f) => ({ name: f.name, dir: f.dir })),
    skillsAllow: allow,
    skillsMissing: missing,
    claude: { pluginDir, settingsFile, mcpFile },
    opencode: { agentFile, agentName: opencodeAgentName },
  };
}

// CLAUDE.md del proyecto con @AGENTS.md (Fase 3) — se agrega una sola vez.
function ensureClaudeMemory(projectDir) {
  const file = path.join(projectDir, "CLAUDE.md");
  const importLine = "@AGENTS.md";
  if (!fs.existsSync(file)) {
    write(file, `# CLAUDE.md\n\n${importLine}\n`);
    return true;
  }
  const content = fs.readFileSync(file, "utf8");
  if (!content.split(/\r?\n/).map((l) => l.trim()).includes(importLine)) {
    fs.appendFileSync(file, `\n${importLine}\n`);
    return true;
  }
  return false;
}

// Comandos slash en el proyecto (`project` source, incluida por
// --setting-sources project,local). A nivel usuario (~/.claude/commands) el
// orquestador no los vería; así /hermad y /hermad:orchestrate quedan visibles.
function ensureCommands(projectDir) {
  let wrote = false;
  for (const [src, rel] of [["hermad.md", "hermad.md"], ["orchestrate.md", path.join("hermad", "orchestrate.md")]]) {
    const from = path.join(REPO_ROOT, "command", src);
    if (!fs.existsSync(from)) continue;
    write(path.join(projectDir, ".claude", "commands", rel), fs.readFileSync(from, "utf8"));
    wrote = true;
  }
  return wrote;
}

// .gitignore del proyecto para lo generado.
function ensureGitignore(projectDir) {
  const file = path.join(projectDir, ".gitignore");
  const entries = [".hermad/generated/", ".hermad/worktrees/", ".hermad/inbox/", ".hermad/memory/", ".hermad/state.json", ".opencode/agents/hermad-*"];
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const lines = current.split(/\r?\n/).map((l) => l.trim());
  const missing = entries.filter((e) => !lines.includes(e));
  if (!missing.length) return false;
  fs.writeFileSync(file, current.replace(/\n?$/, "\n") + missing.join("\n") + "\n");
  return true;
}

module.exports = { renderPersona, ensureClaudeMemory, ensureCommands, ensureGitignore, GEN_DIR, splitModelFlags, modelIdFrom, taskSkillsBlock, nativeFor, safeSkillDir, skillFolders, applyPlaceholders, languageName };
