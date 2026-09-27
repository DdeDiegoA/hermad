"use strict";
const fs = require("fs");
const path = require("path");

// Memoria en dos capas (D3/D4):
//  - AGENTS.md curado (solo el orquestador escribe) — se lee entero.
//  - .hermad/memory/journal.md append-only — cada agente escribe una línea.
// Formato de entrada: - <ISO> [<agente>] [scope] <texto en una línea>
//   scope ∈ all | persona:<p> | story:<id>
// Nadie recibe el journal completo: `slice` filtra por persona/story.

const MEMORY_REL = path.join(".hermad", "memory");
const JOURNAL_REL = path.join(MEMORY_REL, "journal.md");

function journalPath(projectDir) {
  return path.join(projectDir, JOURNAL_REL);
}

function agentNameFromEnv(explicit) {
  return explicit || process.env.HERMAD_AGENT || process.env.HERDR_AGENT_NAME || "agente";
}

function append(projectDir, { agent, text, story, forPersona } = {}) {
  const scope = story ? `story:${story}` : forPersona ? `persona:${forPersona}` : "all";
  const clean = (text || "").replace(/\s*\n\s*/g, " ").trim();
  if (!clean) throw new Error("nota vacía");
  const file = journalPath(projectDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const line = `- ${new Date().toISOString()} [${agentNameFromEnv(agent)}] [${scope}] ${clean}\n`;
  fs.appendFileSync(file, line);
  return { file, scope, line: line.trim() };
}

// Lee las entradas aplicables a una persona/story. Devuelve los textos crudos.
function relevant(projectDir, { persona, story } = {}) {
  const file = journalPath(projectDir);
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^-\s+\S+\s+\[[^\]]*\]\s+\[([^\]]+)\]\s+(.*)$/);
    if (!m) continue;
    const scope = m[1];
    if (scope === "all" || (persona && scope === `persona:${persona}`) || (story && scope === `story:${story}`)) {
      out.push(line);
    }
  }
  return out;
}

// Bloque atómico: AGENTS.md (si existe) + entradas aplicables. Es lo que se
// inyecta en el system prompt renderizado y en el hook SessionStart.
// includeAgents=false para vendors que ya leen AGENTS.md nativo (opencode).
function slice(projectDir, { persona, story, includeAgents = true } = {}) {
  const parts = [];
  const agents = path.join(projectDir, "AGENTS.md");
  if (includeAgents && fs.existsSync(agents)) {
    parts.push("<!-- AGENTS.md -->\n" + fs.readFileSync(agents, "utf8").trim());
  }
  const entries = relevant(projectDir, { persona, story });
  if (entries.length) {
    parts.push("<!-- journal (entradas para " + (persona || story || "todos") + ") -->\n" + entries.join("\n"));
  }
  return parts.join("\n\n");
}

module.exports = { MEMORY_REL, JOURNAL_REL, journalPath, append, relevant, slice };
