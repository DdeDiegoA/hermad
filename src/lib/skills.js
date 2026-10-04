"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseFrontmatter } = require("./prompts");

// Resuelve skills por nombre contra los roots que usan claude/opencode/hermes.
// No hay registro central: escaneamos los dirs conocidos y, para plugins, el
// cache de claude (skill = "<plugin>:<skill>").
const HOME = os.homedir();

function globalRoots() {
  const roots = [
    { dir: path.join(HOME, ".claude", "skills"), plugin: null, source: "claude" },
    { dir: path.join(HOME, ".config", "opencode", "skills"), plugin: null, source: "opencode" },
    { dir: path.join(HOME, ".agents", "skills"), plugin: null, source: "agents" },
  ];
  // hermes agrupa sus skills en subcarpetas (p.ej. skills/<categoria>/<skill>),
  // así que el root pelado no alcanza: bajamos un nivel y sumamos los profiles.
  const hermesSkills = path.join(HOME, ".hermes", "skills");
  roots.push({ dir: hermesSkills, plugin: null, source: "hermes" });
  for (const sub of safeReaddir(hermesSkills)) roots.push({ dir: path.join(hermesSkills, sub), plugin: null, source: "hermes" });
  const hermesProfiles = path.join(HOME, ".hermes", "profiles");
  for (const profile of safeReaddir(hermesProfiles)) roots.push({ dir: path.join(hermesProfiles, profile, "skills"), plugin: null, source: "hermes" });

  const cache = path.join(HOME, ".claude", "plugins", "cache");
  if (fs.existsSync(cache)) {
    for (const marketplace of safeReaddir(cache)) {
      const mpDir = path.join(cache, marketplace);
      for (const plugin of safeReaddir(mpDir)) {
        const plDir = path.join(mpDir, plugin);
        for (const version of safeReaddir(plDir)) {
          roots.push({ dir: path.join(plDir, version, "skills"), plugin, source: "claude-plugin" });
        }
      }
    }
  }
  return roots;
}

function projectRoots(projectDir) {
  if (!projectDir) return [];
  return [
    { dir: path.join(projectDir, ".claude", "skills"), plugin: null, source: "project" },
    { dir: path.join(projectDir, ".opencode", "skills"), plugin: null, source: "project" },
    { dir: path.join(projectDir, ".agents", "skills"), plugin: null, source: "project" },
  ];
}

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() || d.isSymbolicLink()).map((d) => d.name);
  } catch {
    return [];
  }
}

// parseFrontmatter no saca las comillas YAML: las limpiamos acá para que el
// índice no guarde `"descripción"` con comillas.
function unquote(s) {
  const t = String(s || "").trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) return t.slice(1, -1);
  return t;
}

function skillMeta(dir) {
  const file = path.join(dir, "SKILL.md");
  if (!fs.existsSync(file)) return null;
  const { meta, body } = parseFrontmatter(fs.readFileSync(file, "utf8"));
  const description = unquote(meta.description || body.split("\n")[0] || "");
  return { name: unquote(meta.name || path.basename(dir)), description };
}

// Escanea roots y devuelve entradas {id, name, display, description, dir, source}.
// id = display con namespace de plugin ("plugin:skill") o nombre plano.
function scanRoots(roots) {
  const out = [];
  const seen = new Set();
  for (const root of roots) {
    for (const child of safeReaddir(root.dir)) {
      const skillDir = path.join(root.dir, child);
      const meta = skillMeta(skillDir);
      if (!meta) continue;
      const display = root.plugin ? `${root.plugin}:${meta.name}` : meta.name;
      if (seen.has(display)) continue;
      seen.add(display);
      out.push({ id: display, name: meta.name, display, description: meta.description, dir: skillDir, source: root.source });
    }
  }
  return out;
}

// Lista todas las skills instaladas (global + proyecto). display = nombre con
// namespace si viene de plugin.
function listInstalled(projectDir) {
  return scanRoots([...globalRoots(), ...projectRoots(projectDir)]);
}

// Globales efectivas = globalSkills de ~/.hermad/config.json ∪ add − remove.
// El override por proyecto vive en project.json `skills` (o `globalSkills`) con
// forma {add:[], remove:[]}. `config` se inyecta en tests.
function effectiveGlobals(project, { config: cfg } = {}) {
  const c = cfg || require("./config").load();
  const global = Array.isArray(c.globalSkills) ? c.globalSkills : [];
  const override = (project && (project.skills || project.globalSkills)) || {};
  const add = Array.isArray(override) ? override : override.add || [];
  const remove = Array.isArray(override) ? [] : override.remove || [];
  return [...new Set([...global, ...add].filter((s) => s && !remove.includes(s)))];
}

// Resuelve un nombre pedido (plano o "<plugin>:<skill>") a su dir.
function resolve(name, projectDir) {
  const roots = [...projectRoots(projectDir), ...globalRoots()];
  if (name.includes(":")) {
    const [plugin, skill] = name.split(":");
    for (const { dir, plugin: p } of roots) {
      if (p !== plugin) continue;
      const candidate = path.join(dir, skill);
      if (skillMeta(candidate)) return candidate;
      for (const child of safeReaddir(dir)) {
        const d = path.join(dir, child);
        const m = skillMeta(d);
        if (m && m.name === skill) return d;
      }
    }
    return null;
  }
  for (const { dir } of roots) {
    const direct = path.join(dir, name);
    if (skillMeta(direct)) return direct;
    for (const child of safeReaddir(dir)) {
      const d = path.join(dir, child);
      const m = skillMeta(d);
      if (m && m.name === name) return d;
    }
  }
  return null;
}

function resolveAll(names, projectDir) {
  const found = [];
  const missing = [];
  for (const name of names || []) {
    const dir = resolve(name, projectDir);
    if (dir) found.push({ name, dir });
    else missing.push(name);
  }
  return { found, missing };
}

// Skills que claude carga del propio proyecto (`.claude/skills/`, fuente `project`):
// --setting-sources project,local no las oculta, así que hay que negarlas una a una.
function listProjectClaude(...dirs) {
  const names = new Set();
  for (const d of dirs) {
    if (!d) continue;
    const root = path.join(d, ".claude", "skills");
    for (const child of safeReaddir(root)) {
      const meta = skillMeta(path.join(root, child));
      if (meta) names.add(meta.name);
    }
  }
  return [...names].sort();
}

module.exports = { listInstalled, listProjectClaude, resolve, resolveAll, globalRoots, projectRoots, scanRoots, effectiveGlobals };
