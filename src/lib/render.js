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

function linkSkill(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  try {
    fs.symlinkSync(src, dest, "dir");
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

// sourceDir = de dónde se lee la memoria (AGENTS.md + journal) y las skills. En
// un worktree projectDir=wtDir (salida del agente) pero sourceDir=repo principal.
function renderPersona({ projectDir, sourceDir = projectDir, name, agentName, persona, compactPct = 50 }) {
  const p = prompts.loadPersona(name) || { skills: [], body: persona.rol || `You are the ${name} persona.` };
  const memBlock = memory.slice(sourceDir, { persona: name });
  const baseBody = p.body;
  // El prompt-por-archivo de claude/opencode NO lleva memoria: claude la recibe
  // por CLAUDE.md/@AGENTS.md + el hook, opencode por el AGENTS.md nativo. Solo el
  // fallback (hermes/codex/…) necesita el bloque atómico embebido.
  const promptFile = path.join(projectDir, GEN_DIR, "prompts", `${name}.md`);
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

  const { found, missing } = skills.resolveAll(p.skills, sourceDir);
  for (const miss of missing) {
    if (warnedMissing.has(miss)) continue;
    warnedMissing.add(miss);
    console.log(`[!] skill '${miss}' no existe instalada — se omite (la allowlist no aborta)`);
  }

  // claude: plugin por persona (skills allowlist + hook de memoria) + settings.
  const pluginDir = path.join(projectDir, GEN_DIR, "claude", name);
  const pluginSkills = path.join(pluginDir, "skills");
  fs.rmSync(pluginSkills, { recursive: true, force: true });
  for (const { name: skillName, dir } of found) linkSkill(dir, path.join(pluginSkills, skillName));
  write(
    path.join(pluginDir, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: `hermad-${name}`, version: "0.0.1", description: `Hermad persona ${name}`, skills: "./skills/", hooks: "./hooks/hooks.json" }, null, 2) + "\n"
  );
  write(
    path.join(pluginDir, "hooks", "hooks.json"),
    JSON.stringify(
      { hooks: { SessionStart: [{ matcher: "startup|resume|clear|compact", hooks: [{ type: "command", command: `hermad memory slice ${name}; exit 0`, timeout: 10 }] }] } },
      null,
      2
    ) + "\n"
  );
  // skipDangerousModePermissionPrompt: sin esto claude muestra un diálogo de
  // confirmación del modo bypass al arrancar y el agente queda blocked.
  const settings = {
    env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: String(compactPct), HERMAD_AGENT: agentName || name },
    skipDangerousModePermissionPrompt: true,
  };
  // readonly: se niegan los writers directos; Bash de escritura queda documentado
  // en el prompt (los permisos de Bash no cubren `>` ni todos los writers).
  if (p.readonly) settings.permissions = { deny: ["Edit", "Write", "NotebookEdit", "Bash(sed -i:*)", "Bash(tee:*)", "Bash(dd:*)"] };
  const settingsFile = path.join(projectDir, GEN_DIR, "claude", `${name}.settings.json`);
  write(settingsFile, JSON.stringify(settings, null, 2) + "\n");

  // opencode: agente md (prompt por archivo + permisos de skill + readonly).
  const opencodeAgentName = `hermad-${name}`;
  const agentFile = path.join(projectDir, ".opencode", "agents", `${opencodeAgentName}.md`);
  const skillPerms = { "*": "deny" };
  for (const { name: skillName } of found) skillPerms[skillName] = "allow";
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
    skillsFound: found.map((f) => f.name),
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
  if (!content.split("\n").includes(importLine)) {
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
  const lines = current.split("\n");
  const missing = entries.filter((e) => !lines.includes(e));
  if (!missing.length) return false;
  fs.writeFileSync(file, current.replace(/\n?$/, "\n") + missing.join("\n") + "\n");
  return true;
}

module.exports = { renderPersona, ensureClaudeMemory, ensureCommands, ensureGitignore, GEN_DIR, splitModelFlags, modelIdFrom };
