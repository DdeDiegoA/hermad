"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");
const config = require("../lib/config");
const personasEnv = require("../lib/personas-env");
const { saveActiveProject } = require("../lib/active-project");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const AGENTS_TEMPLATE = path.join(REPO_ROOT, "templates", "AGENTS-template.md");
// Copia bash de referencia (humano/skill), no la lee ningún comando de hermad —
// la fuente de verdad nativa es ~/.hermad/active-project.json (ver lib/active-project.js).
const ACTIVE_PERSONAS_ENV = path.join(os.homedir(), ".hermad", "personas.env");

const BMAD_INSTALL_CMD =
  "script -q /tmp/b.log sh -c 'stty cols 160 rows 50 2>/dev/null || true; exec npx -y bmad-method@latest install --yes --directory . --modules bmm --tools claude-code,opencode --communication-language Spanish --document-output-language Spanish'";

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

  // Copia canónica del proyecto (versionable, sirve para reactivar el workspace luego).
  fs.writeFileSync(path.join(projectDir, ".hermad", "personas.env"), rendered);
  fs.writeFileSync(
    path.join(projectDir, ".hermad", "project.json"),
    JSON.stringify({ name, projectDir, createdAt: new Date().toISOString() }, null, 2) + "\n"
  );
  // Copia bash de referencia, por si alguien corre skill/scripts/orquestar.sh a mano.
  fs.mkdirSync(path.dirname(ACTIVE_PERSONAS_ENV), { recursive: true });
  fs.writeFileSync(ACTIVE_PERSONAS_ENV, rendered);

  // Fuente de verdad nativa: lo que leen `hermad start-team` / `hermad orchestrate`.
  saveActiveProject({ projectDir, label: name, personas: cfg.personas, departamentos: personasEnv.DEFAULT_DEPARTAMENTOS });
  console.log(`[+] proyecto activado (hermad start-team / hermad orchestrate ya apuntan acá)`);

  if (args.includes("--run-bmad-install")) {
    console.log("[+] instalando BMad (requiere TTY)...");
    execSync(BMAD_INSTALL_CMD, { cwd: projectDir, stdio: "inherit", shell: "/bin/sh" });
  } else {
    console.log("\nSiguiente paso — instalar BMad en el proyecto (requiere TTY):");
    console.log(`  cd ${projectDir} && ${BMAD_INSTALL_CMD}`);
  }

  console.log(`\nListo. Para arrancar el workspace de agentes:`);
  console.log("  hermad start-team          # conectados, sin prompt inicial");
  console.log('  hermad orchestrate "..."   # + le manda el intent al orquestador');
}

module.exports = { run };
