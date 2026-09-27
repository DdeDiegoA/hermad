"use strict";
const fs = require("fs");
const path = require("path");

const PROMPTS_DIR = path.join(__dirname, "..", "..", "templates", "prompts");

// Frontmatter mínimo (name, skills, readonly) al estilo YAML plano — sin
// dependencias. Cualquier línea desconocida se ignora.
function parseFrontmatter(text) {
  const meta = {};
  let body = text;
  if (text.startsWith("---\n") || text.startsWith("---\r\n")) {
    const end = text.indexOf("\n---", 3);
    if (end !== -1) {
      const fm = text.slice(3, end).trim();
      body = text.slice(text.indexOf("\n", end + 1) + 1).trim();
      for (const line of fm.split("\n")) {
        const m = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
        if (!m) continue;
        let [, key, val] = m;
        val = val.trim();
        if (val.startsWith("[") && val.endsWith("]")) {
          meta[key] = val.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
        } else if (val === "true" || val === "false") {
          meta[key] = val === "true";
        } else {
          meta[key] = val;
        }
      }
    }
  }
  return { meta, body: body.trim() };
}

function loadPersona(name) {
  const file = path.join(PROMPTS_DIR, `${name}.md`);
  if (!fs.existsSync(file)) return null;
  const { meta, body } = parseFrontmatter(fs.readFileSync(file, "utf8"));
  return { name: meta.name || name, skills: meta.skills || [], readonly: !!meta.readonly, body };
}

// Compat: el cuerpo sin frontmatter (lo que se inyecta antes de Fase 2).
function loadPersonaPrompt(name) {
  const p = loadPersona(name);
  return p ? p.body : null;
}

module.exports = { loadPersona, loadPersonaPrompt, parseFrontmatter, PROMPTS_DIR };
