"use strict";
const config = require("../lib/config");
const { detectInstalledVendors, modelsFor } = require("../lib/vendors");
const { select, ask } = require("../lib/prompt");

async function pickPersona(name, current, installedVendors) {
  console.log(`\n— ${name} (${current.rol}) — actual: ${current.kind} ${current.modelFlag}`);
  const vendorOptions = installedVendors.length ? installedVendors : ["claude", "opencode", "codex", "gemini", "hermes"];
  const vendor = await select("CLI/vendor:", vendorOptions, {
    defaultIndex: Math.max(vendorOptions.indexOf(current.kind), 0),
  });
  const models = modelsFor(vendor);
  if (!models.length) {
    const manual = await ask(`No hay catálogo para "${vendor}" — flag de modelo a mano (enter para vacío): `);
    return { kind: vendor, modelFlag: manual, rol: current.rol };
  }
  const picked = await select(`Modelo para ${vendor}:`, models.map((m) => m.label));
  const model = models[models.map((m) => m.label).indexOf(picked)];
  return { kind: vendor, modelFlag: model.flag, rol: current.rol };
}

// Única escritura de `settings agents`: la plantilla global. Guarda el cfg
// completo (no solo {personas}) para no borrar globalSkills ni claves
// desconocidas. NO toca proyectos (project.json / personas.env / activo) — eso
// es `settings project`.
function applyGlobal(cfg) {
  config.save(cfg);
}

async function run(args) {
  const sub = args[0];
  // `project` = reajustar los vendors del proyecto (source of truth = project.json),
  // sin tocar la config global. Ver commands/settings-project.js.
  if (sub === "project") return require("./settings-project").run(args.slice(1));
  if (sub !== "agents") {
    console.error("Uso: hermad settings agents [<persona>]                  (plantilla global)");
    console.error("     hermad settings project [<persona>] [--from-global] (solo el proyecto)");
    process.exit(1);
  }

  const projectFlagIdx = args.indexOf("--project");
  if (projectFlagIdx >= 0) {
    const dirArg = args[projectFlagIdx + 1];
    if (!dirArg || dirArg.startsWith("--")) {
      console.error("Uso: hermad settings agents [<persona>]");
      process.exit(1);
    }
    console.error("`hermad settings agents` es la plantilla global y no toca proyectos. Usá `hermad settings project`.");
    process.exit(1);
  }

  const only = args[1] && !args[1].startsWith("--") ? args[1] : null;
  const cfg = config.load();
  const installed = detectInstalledVendors();
  const names = only ? [only] : Object.keys(cfg.personas);

  for (const name of names) {
    if (!cfg.personas[name]) {
      console.error(`persona desconocida: ${name} (opciones: ${Object.keys(cfg.personas).join(", ")})`);
      process.exit(1);
    }
    cfg.personas[name] = await pickPersona(name, cfg.personas[name], installed);
  }
  applyGlobal(cfg);
  console.log(`\n[+] plantilla global actualizada en ${config.CONFIG_PATH}`);
  console.log("    Para llevar estos vendors a un proyecto: `hermad settings project --from-global`.");
}

module.exports = { run, pickPersona, applyGlobal };
