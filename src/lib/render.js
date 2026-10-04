"use strict";
const fs = require("fs");
const path = require("path");
const prompts = require("./prompts");
const memory = require("./memory");
const skills = require("./skills");

// Render por proyecto de los artefactos de cada persona (D2). Fuente de verdad:
// templates/. Salida en .hermad/generated/ y .opencode/agents/ (gitignored).
const GEN_DIR = path.join(".hermad", "generated");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const warnedMissing = new Set();

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
function renderPersona({ projectDir, sourceDir = projectDir, name, agentName, persona, compactPct = 50, extraSkills = [], project, globs }) {
  const agentKey = agentName || name;
  const p = prompts.loadPersona(name) || { skills: [], body: persona.rol || `You are the ${name} persona.` };
  const memBlock = memory.slice(sourceDir, { persona: name });

  // Allowlist = frontmatter ∪ globales efectivas ∪ --skills (dedup). render es el
  // único lugar donde se arma; el split nativo/por-ruta depende del vendor (kind).
  const effectiveGlobals = globs || skills.effectiveGlobals(project || {});
  const allow = [...new Set([...(p.skills || []), ...(persona.skills || []), ...effectiveGlobals, ...extraSkills].filter(Boolean))];
  const { found, missing } = skills.resolveAll(allow, sourceDir);
  const native = [];
  const byPath = [];
  for (const f of found) (nativeFor(persona.kind, skillSource(f.dir, sourceDir)) ? native : byPath).push(f);
  const taskBlock = taskSkillsBlock(byPath.map((f) => path.join(f.dir, "SKILL.md")));
  const kindBody = persona.kind === "claude" ? `${p.body}\n\n${CLAUDE_DELEGATION_RULE}` : p.body;
  const baseBody = [kindBody, taskBlock].filter(Boolean).join("\n\n");
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
  for (const { name: skillName, dir } of found) linkSkill(dir, path.join(pluginSkills, safeSkillDir(skillName)));
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
    // skillsFound = lo que el vendor carga nativo (hermes --skills, plugin claude).
    skillsFound: native.map((f) => f.name),
    skillsNative: native.map((f) => f.name),
    skillsByPath: byPath.map((f) => ({ name: f.name, dir: f.dir })),
    skillsAllow: allow,
    skillsMissing: missing,
    claude: { pluginDir, settingsFile },
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

module.exports = { renderPersona, ensureClaudeMemory, ensureCommands, ensureGitignore, GEN_DIR, splitModelFlags, modelIdFrom, taskSkillsBlock, nativeFor, safeSkillDir };
