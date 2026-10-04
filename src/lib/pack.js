"use strict";
// Pack base: copia `skill/` + los dos comandos a ~/.hermad/pack (swap atómico) y
// enlaza DESDE AHÍ a los vendors detectados (nunca al clone: FR-1.1). Relink
// idempotente + migra los symlinks viejos que apuntaban al repo (A9, NFR-8).
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

// Destino por vendor. `src` es relativo al pack y al repo (mismo layout).
const DESTINATIONS = [
  { vendor: "claude", src: "skill", dest: [".claude", "skills", "herdr-bmad"], dir: true },
  { vendor: "opencode", src: "skill", dest: [".config", "opencode", "skills", "herdr-bmad"], dir: true },
  { vendor: "hermes", src: "skill", dest: [".hermes", "skills", "autonomous-ai-agents", "herdr-bmad"], dir: true },
  { vendor: "claude", src: path.join("command", "hermad.md"), dest: [".claude", "commands", "hermad.md"], dir: false },
  { vendor: "opencode", src: path.join("command", "hermad.md"), dest: [".config", "opencode", "commands", "hermad.md"], dir: false },
  { vendor: "claude", src: path.join("command", "orchestrate.md"), dest: [".claude", "commands", "hermad", "orchestrate.md"], dir: false },
  { vendor: "opencode", src: path.join("command", "orchestrate.md"), dest: [".config", "opencode", "commands", "hermad-orchestrate.md"], dir: false },
];

const SKIP_FILES = new Set(["personas.env"]); // no se distribuye (design §2)

function packDirFor(home = os.homedir()) {
  return path.join(home, ".hermad", "pack");
}

// Una skill es del pack base si su dir cae dentro de ~/.hermad/pack: no es una
// skill del usuario y nunca debe entrar en las propuestas del wizard ni de
// `hermad skills suggest` (si no, un re-run la "descubre" y cambia la config).
function isPackSkill(dir, home = os.homedir()) {
  try {
    const real = fs.realpathSync(dir);
    const realPack = fs.realpathSync(packDirFor(home));
    return real === realPack || real.startsWith(realPack + path.sep);
  } catch {
    return false;
  }
}

function rmPath(fsImpl, p) {
  fsImpl.rmSync(p, { recursive: true, force: true });
}

// Copia archivo o árbol, saltando lo que no se distribuye (personas.env).
function copyTree(fsImpl, src, dest) {
  const st = fsImpl.statSync(src);
  if (st.isDirectory()) {
    fsImpl.mkdirSync(dest, { recursive: true });
    for (const entry of fsImpl.readdirSync(src)) {
      if (SKIP_FILES.has(entry)) continue;
      copyTree(fsImpl, path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fsImpl.mkdirSync(path.dirname(dest), { recursive: true });
    fsImpl.copyFileSync(src, dest);
  }
}

function sameTree(fsImpl, a, b) {
  let sa;
  let sb;
  try {
    sa = fsImpl.statSync(a);
    sb = fsImpl.statSync(b);
  } catch {
    return false;
  }
  if (sa.isDirectory() !== sb.isDirectory()) return false;
  if (!sa.isDirectory()) {
    try {
      return fsImpl.readFileSync(a).equals(fsImpl.readFileSync(b));
    } catch {
      return false;
    }
  }
  const la = fsImpl.readdirSync(a).filter((e) => !SKIP_FILES.has(e)).sort();
  const lb = fsImpl.readdirSync(b).filter((e) => !SKIP_FILES.has(e)).sort();
  return la.length === lb.length && la.every((e, i) => e === lb[i] && sameTree(fsImpl, path.join(a, e), path.join(b, e)));
}

function readManifest(fsImpl, packDir) {
  try {
    return JSON.parse(fsImpl.readFileSync(path.join(packDir, "manifest.json"), "utf8"));
  } catch {
    return null;
  }
}

function writeManifest(fsImpl, packDir, manifest) {
  fsImpl.mkdirSync(packDir, { recursive: true });
  fsImpl.writeFileSync(path.join(packDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

function repoVersion(repoRoot, fsImpl) {
  try {
    return JSON.parse(fsImpl.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version || null;
  } catch {
    return null;
  }
}

// install: copia a pack.tmp-<pid> y recién entonces intercambia. Si algo falla
// antes del rename, el pack anterior queda intacto (FR-3.6); el manifest viejo
// (y sus copias registradas, p.ej. Windows) sobrevive al swap.
function install({ home = os.homedir(), repoRoot = REPO_ROOT, fsImpl = fs, copy = copyTree } = {}) {
  const packDir = packDirFor(home);
  const tmp = `${packDir}.tmp-${process.pid}`;
  const backup = `${packDir}.old-${process.pid}`;
  fsImpl.mkdirSync(path.dirname(packDir), { recursive: true });
  rmPath(fsImpl, tmp);
  rmPath(fsImpl, backup);
  const prev = readManifest(fsImpl, packDir);
  fsImpl.mkdirSync(tmp, { recursive: true });
  try {
    copy(fsImpl, path.join(repoRoot, "skill"), path.join(tmp, "skill"));
    copy(fsImpl, path.join(repoRoot, "command", "hermad.md"), path.join(tmp, "command", "hermad.md"));
    copy(fsImpl, path.join(repoRoot, "command", "orchestrate.md"), path.join(tmp, "command", "orchestrate.md"));
    writeManifest(fsImpl, tmp, {
      version: repoVersion(repoRoot, fsImpl),
      installedAt: new Date().toISOString(),
      links: prev && Array.isArray(prev.links) ? prev.links : [],
    });
  } catch (err) {
    rmPath(fsImpl, tmp);
    throw err;
  }

  const had = fsImpl.existsSync(packDir);
  if (had) fsImpl.renameSync(packDir, backup);
  try {
    fsImpl.renameSync(tmp, packDir);
  } catch (err) {
    if (had && !fsImpl.existsSync(packDir)) fsImpl.renameSync(backup, packDir);
    rmPath(fsImpl, tmp);
    throw err;
  }
  rmPath(fsImpl, backup);
  return { packDir, changed: true };
}

// Enlaces deseados para los vendors detectados. hermes no corre nativo en
// Windows → no se enlaza (NFR-7).
function desiredLinks({ home, vendors = [], platform = process.platform } = {}) {
  const packDir = packDirFor(home);
  const set = new Set(vendors);
  return DESTINATIONS.filter((d) => set.has(d.vendor) && !(platform === "win32" && d.vendor === "hermes")).map((d) => ({
    vendor: d.vendor,
    linkPath: path.join(home, ...d.dest),
    target: path.join(packDir, d.src),
    srcRel: d.src,
    dir: d.dir,
  }));
}

// Normaliza un target leído de un symlink/junction: en Windows `readlink` puede
// devolver el prefijo \\?\ y la comparación es case-insensitive.
function normTarget(p, platform) {
  const s = path.resolve(String(p)).replace(/^\\\\\?\\/, "");
  return platform === "win32" ? s.toLowerCase() : s;
}

function readlinkTarget(fsImpl, p, platform) {
  return normTarget(path.resolve(path.dirname(p), fsImpl.readlinkSync(p)), platform);
}

function sameTarget(a, b, platform) {
  return normTarget(a, platform) === normTarget(b, platform);
}

function isRepoTarget(target, repoRoot, platform) {
  const repo = normTarget(repoRoot, platform);
  const t = normTarget(target, platform);
  const rel = path.relative(repo, t);
  return t === repo || (rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel));
}

// plan: lista de acciones sin ejecutar. La usa el resumen (paso 7) ANTES de que
// el pack exista, así que no exige el pack.
function plan({ home = os.homedir(), vendors = [], platform = process.platform, repoRoot = REPO_ROOT, fsImpl = fs } = {}) {
  const packDir = packDirFor(home);
  const manifest = readManifest(fsImpl, packDir);
  const managedCopies = new Set(((manifest && manifest.links) || []).filter((l) => l.mode === "copy").map((l) => l.path));

  return desiredLinks({ home, vendors, platform }).map((d) => {
    const st = fsImpl.lstatSync(d.linkPath, { throwIfNoEntry: false });
    if (!st) return { ...d, action: "create" };
    if (st.isSymbolicLink()) {
      const real = readlinkTarget(fsImpl, d.linkPath, platform);
      if (sameTarget(real, d.target, platform)) return { ...d, action: "ok" };
      if (isRepoTarget(real, repoRoot, platform)) return { ...d, action: "migrate", reason: real };
      return { ...d, action: "skip-foreign", reason: real };
    }
    if (managedCopies.has(d.linkPath)) {
      return { ...d, action: sameTree(fsImpl, d.target, d.linkPath) ? "ok" : "overwrite" };
    }
    return { ...d, action: "skip-foreign", reason: d.linkPath };
  });
}

function makeLink(fsImpl, platform, { linkPath, target, dir }) {
  fsImpl.mkdirSync(path.dirname(linkPath), { recursive: true });
  try {
    fsImpl.symlinkSync(target, linkPath, dir ? (platform === "win32" ? "junction" : "dir") : "file");
    return "symlink";
  } catch (err) {
    // Windows: symlink de archivo pide admin/modo dev → copia (NFR-7).
    if (platform !== "win32" || dir) throw err;
    copyTree(fsImpl, target, linkPath);
    return "copy";
  }
}

// relink: ejecuta el plan y registra el modo real de cada enlace. Idempotente:
// segunda corrida = changed 0.
function relink({ home = os.homedir(), vendors = [], platform = process.platform, repoRoot = REPO_ROOT, fsImpl = fs } = {}) {
  const packDir = packDirFor(home);
  if (!fsImpl.existsSync(packDir)) throw new Error("pack no instalado: corré 'hermad setup'");

  const manifest = readManifest(fsImpl, packDir) || { version: null, installedAt: null, links: [] };
  const actions = plan({ home, vendors, platform, repoRoot, fsImpl });
  const links = [];
  let changed = 0;

  for (const a of actions) {
    if (a.action === "ok") {
      const prev = (manifest.links || []).find((l) => l.path === a.linkPath);
      links.push({ path: a.linkPath, target: a.target, mode: prev ? prev.mode : "symlink", vendor: a.vendor });
      continue;
    }
    if (a.action === "skip-foreign") {
      if ((manifest.links || []).some((l) => l.path === a.linkPath)) links.push({ path: a.linkPath, target: a.target, mode: "copy", vendor: a.vendor });
      continue;
    }
    if (a.action === "migrate" || a.action === "overwrite") rmPath(fsImpl, a.linkPath);
    const mode = makeLink(fsImpl, platform, a);
    links.push({ path: a.linkPath, target: a.target, mode, vendor: a.vendor });
    changed += 1;
  }

  writeManifest(fsImpl, packDir, { ...manifest, links });
  return { actions, changed };
}

module.exports = { REPO_ROOT, DESTINATIONS, packDirFor, isPackSkill, install, plan, relink, desiredLinks, copyTree, sameTree };
