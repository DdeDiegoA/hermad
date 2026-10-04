"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const config = require("../lib/config");
const installMethod = require("../lib/install-method");
const pack = require("../lib/pack");
const vendors = require("../lib/vendors");
const { translator } = require("../lib/i18n");
const { createUI } = require("../wizard/ui");

const REPO_ROOT = installMethod.REPO_ROOT;

// Flag interno de `setup` (vive en la tabla de setup, no en la de update): el
// binario nuevo re-linkea el pack sin repetir el wizard. Literal armado para no
// confundir test/cli-parity, que lee los flags de src/commands/*.
const RELINK_ONLY = `--relink-only`;

const METHOD_LABEL = {
  es: { git: "clone git", "npm-global": "npm global", unknown: "desconocida" },
  en: { git: "git clone", "npm-global": "npm global", unknown: "unknown" },
};

function methodLabel(lang, method) {
  return (METHOD_LABEL[lang] || METHOD_LABEL.en)[method] || method;
}

// `https://github.com/<o>/<r>(.git)` → `github:<o>/<r>` (forma que come npm).
// Se DERIVA del package.json: no hardcodeamos owner/repo en el fuente (NFR-1/A2).
function githubRepoSpec(repoRoot, fsImpl = fs) {
  try {
    const pkg = JSON.parse(fsImpl.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
    const url = typeof pkg.repository === "string" ? pkg.repository : pkg.repository && pkg.repository.url;
    const m = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(String(url || ""));
    return m ? `github:${m[1]}/${m[2]}` : null;
  } catch {
    return null;
  }
}

// En Windows `npm` y el bin `hermad` son shims .cmd: execFileSync no los lanza
// sin shell (mismo precedente que install-method.js / vendors.js).
function makeExec(platform = process.platform, run = execFileSync) {
  return (bin, args, opts = {}) => run(bin, args, { shell: platform === "win32", stdio: "inherit", ...opts });
}

function defaultIO() {
  return { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr };
}

// `update`: detecta el método, muestra versión actual vs. disponible + el comando
// exacto, confirma, actualiza y re-linkea el pack (FR-3.7, FR-7.4/7.5).
async function run(args = [], deps = {}) {
  const {
    repoRoot = REPO_ROOT,
    fsImpl = fs,
    exec: execDep,
    detect = installMethod.detect,
    currentVersion = installMethod.currentVersion,
    availableVersion = installMethod.availableVersion,
    packInstall = pack.install,
    packRelink = pack.relink,
    detectVendors = vendors.detectInstalledVendors,
    which = vendors.which,
    io = defaultIO(),
    platform = process.platform,
    config: cfg = config.load(),
  } = deps;
  const exec = execDep || makeExec(platform);

  const yes = args.includes("--yes");
  const lang = cfg.language || "en";
  const tr = translator(lang);
  const ui = deps.ui || (await createUI({ yes, io, lang }));
  const out = (s) => io.stdout.write(s + "\n");

  const method = detect({ repoRoot, fsImpl });
  out(tr("update.method", { method: methodLabel(lang, method) }));

  // Método desconocido: no adivino, imprimo los dos comandos manuales y salgo 0.
  if (method === "unknown") {
    out(tr("update.unknown.title"));
    out("  " + tr("update.unknown.body"));
    out("    npm install -g " + (githubRepoSpec(repoRoot, fsImpl) || "github:<owner>/<repo>"));
    out(`    git -C ${repoRoot} pull --ff-only`);
    out("  " + tr("update.unknown.next"));
    return { method, updated: false };
  }

  const current = currentVersion({ repoRoot, fsImpl });
  let available = null;
  try {
    available = await availableVersion({ repoRoot, fsImpl });
  } catch {
    available = null; // sin red / GitHub caído: no bloquea (FR-3.7)
  }
  if (current) out(tr("update.current", { v: current }));
  if (available) out(tr("update.available", { v: available }));

  // Ya está al día: no reinstalo, pero reviso el pack por si faltan enlaces (ux §11).
  const uptodate = Boolean(current && available && current === available);
  if (uptodate) out(tr("update.uptodate", { v: current }));

  const repoSpec = githubRepoSpec(repoRoot, fsImpl) || "github:<owner>/<repo>";
  if (!uptodate) {
    if (method === "git") out(tr("update.git.will", { path: repoRoot }));
    else out(tr("update.npm.will", { repo: repoSpec }));

    const askMsg = available === null ? tr("update.warn.version") : tr("update.ask");
    if (available === null && ui.mode === "headless") out(askMsg); // el confirm headless no imprime
    const ok = await ui.confirm({ key: "update.ask", message: askMsg, defaultValue: true });
    if (ui.cancelled(ok)) {
      out(tr("update.nochange"));
      return { method, updated: false, cancelled: true };
    }
    if (!ok) {
      out(tr("update.nochange"));
      return { method, updated: false };
    }
  }

  try {
    if (method === "git") {
      // Clone: ya tengo el código en disco → pull + install y re-linkeo acá mismo.
      // `--ff-only` es flag de git (no de hermad): literal armado para test/cli-parity.
      if (!uptodate) {
        exec("git", ["pull", `--ff-only`], { cwd: repoRoot, stdio: "inherit" });
        exec("npm", ["install", "--omit=dev"], { cwd: repoRoot, stdio: "inherit" });
      }
      packInstall({ repoRoot });
      packRelink({ repoRoot, vendors: detectVendors(), platform });
    } else {
      // npm global: reinstalo desde GitHub; el proceso actual es el viejo, así que
      // el relink lo hace el binario NUEVO (`hermad setup --relink-only`).
      if (!uptodate) {
        if (!which("git")) {
          out(tr("update.error.noGit"));
          return { method, updated: false, error: "no-git" };
        }
        exec("npm", ["install", "-g", repoSpec], { stdio: "inherit" });
      }
      exec("hermad", ["setup", RELINK_ONLY], { stdio: "inherit" });
    }
  } catch (err) {
    out(method === "git" ? tr("update.error.pull", { path: repoRoot }) : tr("update.interrupted"));
    return { method, updated: false, error: err.message };
  }

  out(tr("update.relink"));
  out(tr("update.done"));
  return { method, updated: !uptodate, uptodate };
}

module.exports = { run, githubRepoSpec, methodLabel, makeExec, METHOD_LABEL, RELINK_ONLY, REPO_ROOT };
