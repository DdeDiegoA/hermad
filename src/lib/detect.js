"use strict";
// Detección de prerequisitos del wizard: Node, herdr y vendors. Puro: no ejecuta
// instaladores ni toca disco (FR-3.4). `which`/`run` se inyectan en tests.
const { execFileSync } = require("child_process");
const vendors = require("./vendors");

const MIN_NODE = { major: 20, minor: 12 };
const MIN_NODE_TEXT = `${MIN_NODE.major}.${MIN_NODE.minor}`;

// Comando de instalación de herdr por OS (el texto exacto; la pantalla solo lo muestra).
const HERDR_INSTALL = {
  darwin: "brew install herdr",
  linux: "curl -fsSL https://herdr.dev/install.sh | sh",
  win32: 'powershell -ExecutionPolicy Bypass -c "irm https://herdr.dev/install.ps1 | iex"',
};

function parseNode(version) {
  const m = /^v?(\d+)\.(\d+)/.exec(String(version || ""));
  const major = m ? Number(m[1]) : 0;
  const minor = m ? Number(m[2]) : 0;
  return {
    version: String(version || ""),
    major,
    minor,
    required: MIN_NODE_TEXT,
    ok: major > MIN_NODE.major || (major === MIN_NODE.major && minor >= MIN_NODE.minor),
  };
}

function defaultRun(bin, args) {
  return execFileSync(bin, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function herdrVersion(run) {
  try {
    // `herdr --version` → "herdr 0.9.1": nos quedamos con el último token.
    const out = String(run("herdr", ["--version"])).trim();
    return out.split(/\s+/).pop() || null;
  } catch {
    return null;
  }
}

function detect({ platform = process.platform, nodeVersion = process.version, which = vendors.which, run = defaultRun } = {}) {
  const node = parseNode(nodeVersion);
  const present = Boolean(which("herdr"));
  const vendorList = Object.keys(vendors.VENDOR_BINARIES)
    .filter((kind) => which(vendors.VENDOR_BINARIES[kind].bin))
    .map((kind) => ({ kind, experimental: Boolean(vendors.VENDOR_BINARIES[kind].experimental) }));

  return {
    platform,
    node,
    herdr: {
      present,
      version: present ? herdrVersion(run) : null,
      install: HERDR_INSTALL[platform] || HERDR_INSTALL.linux,
    },
    vendors: vendorList,
  };
}

module.exports = { MIN_NODE_TEXT, HERDR_INSTALL, parseNode, detect };
