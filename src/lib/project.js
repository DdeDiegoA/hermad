"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const config = require("./config");
const personasEnv = require("./personas-env");
const { loadActiveProject, saveActiveProject } = require("./active-project");

const PROJECT_REL = path.join(".hermad", "project.json");

// Un worktree tiene `.git` como archivo, no como dir. Su copia de project.json
// viene de HEAD y es stale: resolvemos siempre al repo principal para que
// journal/inbox/estado sean compartidos y no por-worktree.
function mainRepoRoot(dir) {
  let isWorktree = false;
  try {
    isWorktree = fs.statSync(path.join(dir, ".git")).isFile();
  } catch {
    /* sin .git → dir normal */
  }
  if (!isWorktree) return dir;
  try {
    const common = execFileSync("git", ["-C", dir, "rev-parse", "--path-format=absolute", "--git-common-dir"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (common && path.basename(common) === ".git") return path.dirname(common);
  } catch {
    /* git ausente o viejo → parseo el archivo .git */
  }
  // `.git` de un worktree: "gitdir: <main>/.git/worktrees/<name>".
  try {
    const m = fs.readFileSync(path.join(dir, ".git"), "utf8").match(/gitdir:\s*(.+)/);
    if (m) {
      const parts = path.resolve(dir, m[1].trim()).split(path.sep);
      const i = parts.lastIndexOf(".git");
      if (i > 0) return parts.slice(0, i).join(path.sep);
    }
  } catch {
    /* sin gitdir parseable */
  }
  return dir;
}

// Completa un project.json para que sea autocontenido (personas + departamentos)
// y lo reescribe si faltaba algo. Migración benigna: create-project viejo deja
// solo {name, projectDir, createdAt}.
function hydrate(project, dir) {
  // Plantilla global (incluye las personas del código) como base: agrega las que
  // falten en un project.json viejo (p.ej. `reader`) sin pisar las del proyecto.
  const base = config.load().personas;
  const projectPersonas = project.personas || {};
  const personas = { ...base, ...projectPersonas };
  const departamentos = project.departamentos || personasEnv.DEFAULT_DEPARTAMENTOS;
  const full = {
    name: project.name || path.basename(dir),
    label: project.label || project.name || path.basename(dir),
    projectDir: dir,
    personas,
    departamentos,
    createdAt: project.createdAt || new Date().toISOString(),
  };
  const changed =
    !project.personas ||
    !project.departamentos ||
    project.projectDir !== dir ||
    !project.label ||
    Object.keys(base).some((k) => !projectPersonas[k]);
  if (changed) {
    fs.writeFileSync(path.join(dir, PROJECT_REL), JSON.stringify(full, null, 2) + "\n");
  }
  return full;
}

// Resuelve el proyecto subiendo desde cwd buscando .hermad/project.json.
// `strict` = solo esa búsqueda; si no encuentra, null (sin fallback al activo),
// para no tocar otro proyecto por accidente con una ruta explícita.
// Sin strict, cae al activo global (avisando cuál usó). Al resolver, lo marca activo.
function resolveProject(cwd = process.cwd(), { strict = false } = {}) {
  let dir = path.resolve(cwd);
  while (true) {
    const file = path.join(dir, PROJECT_REL);
    if (fs.existsSync(file)) {
      const root = mainRepoRoot(dir);
      const rootFile = path.join(root, PROJECT_REL);
      const src = fs.existsSync(rootFile) ? rootFile : file;
      const project = hydrate(JSON.parse(fs.readFileSync(src, "utf8")), root);
      saveActiveProject(project);
      return project;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  if (strict) return null;
  const active = loadActiveProject();
  if (active) {
    console.error(`[!] sin .hermad/project.json subiendo desde ${cwd} — uso el proyecto activo global: ${active.projectDir}`);
    return active;
  }
  return null;
}

module.exports = { resolveProject, PROJECT_REL };
