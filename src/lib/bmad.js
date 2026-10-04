"use strict";
// BMad opcional (FR-1.4): arma el comando de instalación con el idioma elegido,
// `--tools` según los vendors detectados y un log en `os.tmpdir()`. No instala
// nada por sí solo: decide `create-project` (preferencia `bmad.autoInstall` o
// `--run-bmad-install`).
const os = require("os");
const path = require("path");

// BMad solo entiende estos ids de tool; el resto de vendors no se pasa.
const VENDOR_TOOL = { claude: "claude-code", opencode: "opencode" };
const LANGUAGE_NAME = { es: "Spanish", en: "English" };

function toolsFor(vendors = []) {
  return [...new Set((vendors || []).map((v) => VENDOR_TOOL[v]).filter(Boolean))];
}

function languageName(lang) {
  return LANGUAGE_NAME[lang] || LANGUAGE_NAME.en;
}

function bmadArgs({ language = "en", vendors = [] } = {}) {
  const args = ["npx", "-y", "bmad-method@latest", "install", "--yes", "--directory", ".", "--modules", "bmm"];
  const tools = toolsFor(vendors);
  if (tools.length) args.push("--tools", tools.join(","));
  const name = languageName(language); // solo es/en → seguro de interpolar
  args.push("--communication-language", name, "--document-output-language", name);
  return args;
}

// Cita un argumento si trae algo fuera del charset seguro (p.ej. el tmpdir).
function quote(arg) {
  const s = String(arg);
  return /^[A-Za-z0-9_./,@=+:-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}

// Unix: el installer de BMad (clack) pide TTY y columnas → `script` + stty, con
// el log en os.tmpdir (sin /tmp fijo). Windows: consola ya TTY, npx directo.
function installCommand({ language = "en", vendors = [], platform = process.platform, tmpdir = os.tmpdir() } = {}) {
  const cmd = bmadArgs({ language, vendors }).map(quote).join(" ");
  if (platform === "win32") return cmd;
  const log = quote(path.join(tmpdir, "hermad-bmad.log"));
  return `script -q ${log} sh -c 'stty cols 160 rows 50 2>/dev/null || true; exec ${cmd}'`;
}

// ¿Toca instalar? Preferencia del setup o flag explícito de create-project.
function wantsInstall(config, args = []) {
  return Boolean((config && config.bmad && config.bmad.autoInstall) || args.includes("--run-bmad-install"));
}

module.exports = { VENDOR_TOOL, LANGUAGE_NAME, toolsFor, languageName, bmadArgs, installCommand, wantsInstall };
