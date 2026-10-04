"use strict";
const realFs = require("fs");
const os = require("os");
const path = require("path");

const { COMMANDS } = require("../commands-table");
const zsh = require("./zsh");
const bash = require("./bash");
const fish = require("./fish");
const powershell = require("./powershell");

// Bloque marcado: install lo reemplaza in place (idempotente, nunca duplica —
// FR-6.2/NFR-8); uninstall lo borra. Mismo marcador en los 4 shells (`#` es
// comentario tambien en PowerShell).
const MARK_START = "# >>> hermad >>>";
const MARK_END = "# <<< hermad <<<";
const SHELLS = ["zsh", "bash", "fish", "powershell"];
const GENERATORS = { zsh, bash, fish, powershell };

const NOSHELL = "No reconocí tu shell. Usa: hermad completion <zsh|bash|fish|powershell>";
const RESTRICTED =
  "PowerShell tiene ExecutionPolicy Restricted: no toqué tu perfil. Cuando lo cambies, ejecuta hermad completion install.";

// --shell > $SHELL > $PSModulePath presente -> powershell (FR-6.5).
function detectShell({ env = process.env, platform = process.platform } = {}) {
  const base = path.basename(env.SHELL || "");
  if (["zsh", "bash", "fish"].includes(base)) return base;
  if (/^(pwsh|powershell)(\.exe)?$/i.test(base)) return "powershell";
  if (env.PSModulePath) return "powershell";
  if (platform === "win32") return "powershell";
  return null;
}

// Rutas estandar + bloque del rc por shell (FR-6.5). El archivo de completion es
// la ruta que el shell autoload; `rc` es donde va el bloque marcado (zsh/bash/ps)
// o null si no hace falta (fish autoload).
function shellSpec(shell, home, fs = realFs) {
  switch (shell) {
    case "zsh":
      return {
        file: path.join(home, ".zfunc", "_hermad"),
        rcPaths: [path.join(home, ".zshrc")],
        block: [MARK_START, 'fpath=("$HOME/.zfunc" $fpath)', "autoload -Uz compinit && compinit", MARK_END].join("\n"),
      };
    case "bash":
      return {
        file: path.join(home, ".local", "share", "bash-completion", "completions", "hermad"),
        rcPaths: [path.join(home, ".bashrc")],
        block: [
          MARK_START,
          '[ -f "$HOME/.local/share/bash-completion/completions/hermad" ] && . "$HOME/.local/share/bash-completion/completions/hermad"',
          MARK_END,
        ].join("\n"),
      };
    case "fish":
      return { file: path.join(home, ".config", "fish", "completions", "hermad.fish"), rcPaths: [], block: null };
    case "powershell": {
      // Perfiles de pwsh (7+) y de Windows PowerShell 5.1. Escribo los que ya
      // existen; si ninguno existe, creo el de pwsh.
      const found = powershellProfiles(home).filter((p) => fs.existsSync(p));
      return {
        file: path.join(home, ".hermad", "completion", "hermad.ps1"),
        rcPaths: found.length ? found : [powershellProfiles(home)[0]],
        block: [MARK_START, '. "$HOME/.hermad/completion/hermad.ps1"', MARK_END].join("\n"),
      };
    }
    default:
      return null;
  }
}

function powershellProfiles(home) {
  return [
    path.join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
    path.join(home, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1"),
  ];
}

function readOr(fs, file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

// Pura: reemplaza el bloque marcado si existe, si no lo agrega al final.
function upsertBlock(existing, block) {
  const start = existing.indexOf(MARK_START);
  const end = existing.indexOf(MARK_END);
  if (start !== -1 && end !== -1 && end > start) {
    return existing.slice(0, start) + block + existing.slice(end + MARK_END.length);
  }
  const sep = existing && !existing.endsWith("\n") ? "\n" : "";
  return existing + sep + block + "\n";
}

// Pura: quita el bloque marcado y deja el resto igual.
function stripBlock(existing) {
  const start = existing.indexOf(MARK_START);
  const end = existing.indexOf(MARK_END);
  if (start === -1 || end === -1 || end < start) return existing;
  const before = existing.slice(0, start);
  const after = existing.slice(end + MARK_END.length).replace(/^\r?\n/, "");
  return before + after;
}

// plan(): que se va a escribir, sin tocar nada. `files[]` = { path, content, kind }.
function plan(shell, deps = {}) {
  const { fs = realFs, home = os.homedir(), commands = COMMANDS } = deps;
  const spec = shellSpec(shell, home, fs);
  if (!spec) return null;
  const files = [{ path: spec.file, kind: "file", content: GENERATORS[shell].generate(commands) }];
  for (const rc of spec.rcPaths) {
    files.push({ path: rc, kind: "block", block: spec.block, content: upsertBlock(readOr(fs, rc), spec.block) });
  }
  return { shell, files };
}

// Texto legible: muestra cada archivo y el cambio ANTES de preguntar (FR-6.5).
function formatPlan(p) {
  const lines = [`Completion de hermad (${p.shell}). Haría esto:`];
  for (const f of p.files) {
    const what = f.kind === "file" ? "crear/reemplazar" : "añadir bloque marcado (# >>> hermad >>>) a";
    lines.push(`  · ${what} ${f.path}`);
  }
  lines.push("  Se puede deshacer con: hermad completion uninstall");
  return lines.join("\n");
}

// Confirmacion interactiva por defecto (readline). Injectable en tests/wizard.
async function defaultConfirm(question) {
  const { ask } = require("../prompt");
  const answer = await ask(question);
  return /^y(es)?$/i.test(answer || "");
}

function isRestricted(exec) {
  try {
    return /restricted/i.test(String(exec("pwsh", ["-NoProfile", "-Command", "Get-ExecutionPolicy"])));
  } catch {
    return false; // sin pwsh no puedo saberlo: no bloqueo
  }
}

// install(shell, deps): shell ya resuelto (o null -> detecta). deps inyectable.
async function install(shell, deps = {}) {
  const {
    fs = realFs,
    home = os.homedir(),
    env = process.env,
    platform = process.platform,
    exec = require("child_process").execFileSync,
    log = console.log,
    confirm = defaultConfirm,
  } = deps;

  const target = shell || detectShell({ env, platform });
  if (!target) {
    const err = new Error(NOSHELL);
    err.code = "NOSHELL";
    throw err;
  }
  if (target === "powershell" && isRestricted(exec)) {
    log(RESTRICTED);
    return { shell: target, installed: false, reason: "restricted" };
  }

  const p = plan(target, { fs, home, commands: deps.commands });
  log(formatPlan(p));
  const ok = await confirm(`¿Escribo estos cambios? [y/N] `);
  if (!ok) return { shell: target, installed: false, reason: "declined" };

  for (const f of p.files) {
    fs.mkdirSync(path.dirname(f.path), { recursive: true });
    fs.writeFileSync(f.path, f.content);
  }
  log(`[+] completion de ${target} instalado. Abre una terminal nueva para que funcione.`);
  return { shell: target, installed: true, files: p.files.map((f) => f.path) };
}

function uninstall(shell, deps = {}) {
  const {
    fs = realFs,
    home = os.homedir(),
    env = process.env,
    platform = process.platform,
    log = console.log,
  } = deps;
  const target = shell || detectShell({ env, platform });
  const spec = target && shellSpec(target, home, fs);
  if (!spec) {
    const err = new Error(NOSHELL);
    err.code = "NOSHELL";
    throw err;
  }
  remove(fs, spec.file);
  for (const rc of spec.rcPaths) {
    if (!fs.existsSync(rc)) continue;
    fs.writeFileSync(rc, stripBlock(readOr(fs, rc)));
  }
  log(`[+] completion de ${target} desinstalado.`);
  return { shell: target, removed: spec.file };
}

function remove(fs, file) {
  if (typeof fs.rmSync === "function") {
    try {
      fs.rmSync(file, { force: true });
      return;
    } catch {
      /* cae a unlink */
    }
  }
  try {
    fs.unlinkSync(file);
  } catch {
    /* ya no estaba */
  }
}

module.exports = {
  detectShell,
  plan,
  formatPlan,
  install,
  uninstall,
  upsertBlock,
  stripBlock,
  MARK_START,
  MARK_END,
  SHELLS,
  NOSHELL,
  RESTRICTED,
};
