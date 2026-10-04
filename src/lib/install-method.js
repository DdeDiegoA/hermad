"use strict";
// ¿Cómo se instaló hermad? Decide el camino de `hermad update` (FR-7.4).
// `git` = clone (existe .git); `npm-global` = bajo `npm root -g`; si no, `unknown`.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function defaultNpmRoot() {
  return execFileSync("npm", ["root", "-g"], { encoding: "utf8", shell: process.platform === "win32" }).trim();
}

function detect({ repoRoot = REPO_ROOT, fsImpl = fs, npmRoot = defaultNpmRoot } = {}) {
  if (fsImpl.existsSync(path.join(repoRoot, ".git"))) return "git";
  let root = null;
  try {
    root = npmRoot();
  } catch {
    root = null;
  }
  if (root && isInside(path.resolve(repoRoot), path.resolve(root))) return "npm-global";
  return "unknown";
}

function currentVersion({ repoRoot = REPO_ROOT, fsImpl = fs } = {}) {
  try {
    return JSON.parse(fsImpl.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version || null;
  } catch {
    return null;
  }
}

// https://github.com/<owner>/<repo>(.git) → https://raw.githubusercontent.com/<owner>/<repo>/main/package.json
function rawPackageUrl(repoUrl) {
  const m = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(String(repoUrl || ""));
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/main/package.json` : null;
}

// Versión publicada de `main`: stdlib fetch, timeout corto; cualquier fallo → null
// (update avisa y no bloquea, FR-3.7). Nunca toca red en otros comandos.
async function availableVersion({ repoRoot = REPO_ROOT, fsImpl = fs, fetchImpl = globalThis.fetch, timeout = 5000 } = {}) {
  if (typeof fetchImpl !== "function") return null;
  let repoUrl = null;
  try {
    repoUrl = JSON.parse(fsImpl.readFileSync(path.join(repoRoot, "package.json"), "utf8")).repository;
  } catch {
    return null;
  }
  const url = rawPackageUrl(typeof repoUrl === "string" ? repoUrl : repoUrl && repoUrl.url);
  if (!url) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (!res || !res.ok) return null;
    const pkg = await res.json();
    return pkg.version || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { REPO_ROOT, isInside, detect, currentVersion, availableVersion, rawPackageUrl };
