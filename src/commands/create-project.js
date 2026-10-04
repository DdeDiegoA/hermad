"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");
const config = require("../lib/config");
const bmad = require("../lib/bmad");
const personasEnv = require("../lib/personas-env");
const render = require("../lib/render");
const vendors = require("../lib/vendors");
const { saveActiveProject } = require("../lib/active-project");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const AGENTS_TEMPLATE = path.join(REPO_ROOT, "templates", "AGENTS-template.md");
// Copia bash de referencia (humano/skill), no la lee ningún comando de hermad —
// la fuente de verdad nativa es ~/.hermad/active-project.json (ver lib/active-project.js).
const ACTIVE_PERSONAS_ENV = path.join(os.homedir(), ".hermad", "personas.env");

// Plan de BMad (idioma de config, tools por vendor detectado): puro y testeable,
// lo usa `run` para saber si instalar y con qué comando (FR-1.4).
function bmadPlan({ config: cfg, args = [], detectedVendors = [], platform = process.platform, tmpdir } = {}) {
  return {
    install: bmad.wantsInstall(cfg, args),
    command: bmad.installCommand({ language: cfg.language || "en", vendors: detectedVendors, platform, tmpdir }),
    // Si lo instalo, la skill bmad-help entra al proyecto (design §2).
    skillAdd: ["bmad-help"],
  };
}

function run(args) {
  const name = args.find((a) => !a.startsWith("--"));
  if (!name) {
    console.error('Uso: hermad create-project "nombre-del-proyecto" [--run-bmad-install]');
    process.exit(1);
  }

  const projectDir = path.resolve(process.cwd(), name);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(path.join(projectDir, ".hermad"), { recursive: true });

  if (!fs.existsSync(path.join(projectDir, ".git"))) {
    execSync("git init -q", { cwd: projectDir });
    console.log(`[+] git init en ${projectDir}`);
  }

  const agentsPath = path.join(projectDir, "AGENTS.md");
  if (!fs.existsSync(agentsPath) && fs.existsSync(AGENTS_TEMPLATE)) {
    fs.copyFileSync(AGENTS_TEMPLATE, agentsPath);
    console.log("[+] AGENTS.md (memoria compartida — solo el orquestador la edita)");
  }

  const cfg = config.load();
  const rendered = personasEnv.render({ projectDir, label: name, personas: cfg.personas });
  const plan = bmadPlan({ config: cfg, args, detectedVendors: vendors.detectInstalledVendors() });

  // Copia canónica del proyecto (versionable, sirve para reactivar el workspace luego).
  fs.writeFileSync(path.join(projectDir, ".hermad", "personas.env"), rendered);
  const projectJson = {
    name,
    label: name,
    projectDir,
    personas: cfg.personas,
    departamentos: personasEnv.DEFAULT_DEPARTAMENTOS,
    createdAt: new Date().toISOString(),
  };
  // Con BMad instalado, bmad-help queda disponible para el proyecto (design §2).
  if (plan.install) projectJson.skills = { add: plan.skillAdd };
  fs.writeFileSync(path.join(projectDir, ".hermad", "project.json"), JSON.stringify(projectJson, null, 2) + "\n");
  // Copia bash de referencia, por si alguien corre skill/scripts/orquestar.sh a mano.
  fs.mkdirSync(path.dirname(ACTIVE_PERSONAS_ENV), { recursive: true });
  fs.writeFileSync(ACTIVE_PERSONAS_ENV, rendered);

  // Memoria claude (CLAUDE.md @AGENTS.md) + comandos + .gitignore, desde el minuto cero.
  render.ensureClaudeMemory(projectDir);
  render.ensureCommands(projectDir);
  render.ensureGitignore(projectDir);

  // Fuente de verdad nativa: lo que leen `hermad start-team` / `hermad orchestrate`.
  saveActiveProject({ projectDir, label: name, personas: cfg.personas, departamentos: personasEnv.DEFAULT_DEPARTAMENTOS });
  console.log(`[+] proyecto activado (hermad start-team / hermad orchestrate ya apuntan acá)`);

  if (plan.install) {
    console.log("[+] instalando BMad (requiere TTY)...");
    execSync(plan.command, { cwd: projectDir, stdio: "inherit", shell: process.platform === "win32" ? true : "/bin/sh" });
  } else {
    console.log("\nSiguiente paso — instalar BMad en el proyecto (requiere TTY):");
    console.log(`  cd ${projectDir} && ${plan.command}`);
  }

  console.log(`\nListo. Para arrancar el workspace de agentes:`);
  console.log("  hermad start-team          # conectados, sin prompt inicial");
  console.log('  hermad orchestrate "..."   # + le manda el intent al orquestador');
}

module.exports = { run, bmadPlan };
