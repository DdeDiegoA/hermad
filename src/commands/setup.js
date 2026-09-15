"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const config = require("../lib/config");
const { detectInstalledVendors, modelsFor } = require("../lib/vendors");
const { select, ask } = require("../lib/prompt");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

const SYMLINKS = [
  [path.join(REPO_ROOT, "skill"), path.join(os.homedir(), ".claude", "skills", "herdr-bmad")],
  [path.join(REPO_ROOT, "skill"), path.join(os.homedir(), ".config", "opencode", "skills", "herdr-bmad")],
  [path.join(REPO_ROOT, "skill"), path.join(os.homedir(), ".hermes", "skills", "autonomous-ai-agents", "herdr-bmad")],
  [path.join(REPO_ROOT, "command", "hermad.md"), path.join(os.homedir(), ".claude", "commands", "hermad.md")],
  [path.join(REPO_ROOT, "command", "hermad.md"), path.join(os.homedir(), ".config", "opencode", "commands", "hermad.md")],
];

function linkOne(target, linkPath) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  const st = fs.lstatSync(linkPath, { throwIfNoEntry: false });
  if (st) {
    if (st.isSymbolicLink() && fs.readlinkSync(linkPath) === target) {
      console.log(`  = ya enlazado: ${linkPath}`);
      return;
    }
    console.log(`  ! ya existe (no-symlink o distinto): ${linkPath} — lo dejo intacto`);
    return;
  }
  fs.symlinkSync(target, linkPath);
  console.log(`  + ${linkPath} -> ${target}`);
}

function installSkillAndCommand() {
  console.log("\nInstalando skill + comando /hermad (symlinks a este repo):");
  for (const [target, linkPath] of SYMLINKS) linkOne(target, linkPath);
}

async function pickPersona(name, current, installedVendors) {
  console.log(`\n— ${name} (${current.rol}) —`);
  const vendorOptions = installedVendors.length ? installedVendors : ["claude", "opencode", "codex", "gemini", "hermes"];
  const vendor = await select("CLI/vendor:", vendorOptions, {
    defaultIndex: Math.max(vendorOptions.indexOf(current.kind), 0),
  });
  const models = modelsFor(vendor);
  if (!models.length) {
    const manual = await ask(`No hay catálogo para "${vendor}" — flag de modelo a mano (ej: --model x, enter para vacío): `);
    return { kind: vendor, modelFlag: manual, rol: current.rol };
  }
  const picked = await select(`Modelo para ${vendor}:`, models.map((m) => m.label));
  const model = models[models.map((m) => m.label).indexOf(picked)];
  return { kind: vendor, modelFlag: model.flag, rol: current.rol };
}

async function run(args) {
  console.log("hermad setup — instala hermad y define qué CLI/modelo corre cada agente\n");

  installSkillAndCommand();

  const installed = detectInstalledVendors();
  console.log(`\nCLIs de coding detectadas en PATH: ${installed.length ? installed.join(", ") : "(ninguna — instalá al menos una: claude, opencode, codex, gemini)"}`);

  const cfg = config.load();
  const skipAgents = args.includes("--skip-agents");
  if (!skipAgents) {
    console.log("\nAhora definí vendor + modelo por agente (enter = default).");
    for (const name of Object.keys(cfg.personas)) {
      cfg.personas[name] = await pickPersona(name, cfg.personas[name], installed);
    }
    config.save(cfg);
  }

  console.log(`\nConfig guardada en ${config.CONFIG_PATH}`);
  console.log("Listo. Próximo paso: `hermad create-project \"nombre\"`.");
}

module.exports = { run };
