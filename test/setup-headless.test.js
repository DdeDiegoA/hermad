"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");
const setup = require("../src/commands/setup");
const { DICTS } = require("../src/lib/i18n");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fixtureRepo() {
  const repo = tmp("setup-repo-");
  fs.mkdirSync(path.join(repo, "skill", "scripts"), { recursive: true });
  fs.writeFileSync(path.join(repo, "skill", "SKILL.md"), "# herdr-bmad\n");
  fs.writeFileSync(path.join(repo, "skill", "scripts", "personas.env"), "SECRET=1\n");
  fs.mkdirSync(path.join(repo, "command"), { recursive: true });
  fs.writeFileSync(path.join(repo, "command", "hermad.md"), "hermad cmd\n");
  fs.writeFileSync(path.join(repo, "command", "orchestrate.md"), "orchestrate cmd\n");
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ version: "0.2.0" }));
  return repo;
}

// deps de un entorno limpio headless: stdin cerrado, un vendor, sin red ni disco real.
function cleanEnv({ home, repoRoot, vendors = ["claude"], output = [] }) {
  return {
    home,
    repoRoot,
    configFile: path.join(home, ".hermad", "config.json"),
    locale: "en",
    io: { stdin: { isTTY: false }, stdout: { write: (s) => output.push(s) }, stderr: { write: (s) => output.push(s) } },
    detect: () => ({
      platform: "linux",
      node: { ok: true, version: "v22.0.0", required: "20.12" },
      herdr: { present: true, version: "1.0.0", install: "x" },
      vendors: vendors.map((kind) => ({ kind, experimental: false })),
    }),
    listInstalled: () => [],
    hasBmad: () => false,
    exec: () => {
      throw new Error("headless no debe ejecutar instaladores sin confirmación");
    },
    callVendor: () => {
      throw new Error("headless no debe llamar al vendor sin --llm-suggest");
    },
  };
}

function readConfig(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("A1: setup --yes headless en HOME limpio con un vendor escribe la config y sale 0 (FR-3.3, A5)", async () => {
  const home = tmp("setup-home-");
  const repoRoot = fixtureRepo();
  const output = [];
  const code = await setup.execute(["--yes"], cleanEnv({ home, repoRoot, output }));
  assert.equal(code, 0);

  const configFile = path.join(home, ".hermad", "config.json");
  const cfg = readConfig(configFile);
  assert.equal(cfg.schemaVersion, 2);
  assert.equal(cfg.language, "en");
  assert.deepEqual(cfg.permissions, { mode: "prompt", acceptedAt: null });
  assert.equal(cfg.bmad.autoInstall, false);
  assert.deepEqual(cfg.globalSkills, []);
  assert.deepEqual(cfg.personaSkills, {});
  for (const [name, p] of Object.entries(cfg.personas)) {
    assert.equal(p.kind, "claude", `${name} usa el único vendor`);
    assert.equal(p.modelFlag, "", `${name} sin modelo silencioso`);
  }

  // pack instalado (sin personas.env) + enlaces solo del vendor detectado
  assert.ok(fs.existsSync(path.join(home, ".hermad", "pack", "skill", "SKILL.md")));
  assert.ok(!fs.existsSync(path.join(home, ".hermad", "pack", "skill", "scripts", "personas.env")), "personas.env no se distribuye");
  assert.ok(fs.existsSync(path.join(home, ".claude", "skills", "herdr-bmad")), "enlace de claude creado");
  assert.ok(!fs.existsSync(path.join(home, ".config", "opencode", "skills", "herdr-bmad")), "no enlaza vendors ausentes");
  assert.ok(output.join("\n").includes(DICTS.en["done.outro"]), "imprime el outro");
});

test("A9: setup --yes repetido imprime Nada que cambiar y no duplica config ni enlaces (NFR-8)", async () => {
  const home = tmp("setup-home-");
  const repoRoot = fixtureRepo();
  await setup.execute(["--yes"], cleanEnv({ home, repoRoot }));

  const configFile = path.join(home, ".hermad", "config.json");
  const before = fs.readFileSync(configFile, "utf8");
  const link = path.join(home, ".claude", "skills", "herdr-bmad");
  const realBefore = fs.realpathSync(link);

  const output = [];
  // El pack ya enlazó herdr-bmad en el vendor: el wizard debe ignorarla (no es
  // una skill del usuario) si no, cada re-run cambiaría la config.
  const env = cleanEnv({ home, repoRoot, output });
  env.listInstalled = () => [{ id: "herdr-bmad", name: "herdr-bmad", description: "Use when orchestrating Herdr + BMad multi-agent flows", dir: link, source: "claude" }];
  const code = await setup.execute(["--yes"], env);
  assert.equal(code, 0);
  assert.ok(output.join("\n").includes(DICTS.en["summary.nochange"]), "avisa que no hay nada que cambiar");
  assert.equal(fs.readFileSync(configFile, "utf8"), before, "config idéntica");
  assert.equal(fs.realpathSync(link), realBefore, "enlaces sin duplicar");
});

test("--accept-bypass imprime la pantalla de riesgo y guarda bypass con acceptedAt (FR-5.1, D6)", async () => {
  const home = tmp("setup-home-");
  const repoRoot = fixtureRepo();
  const output = [];
  const code = await setup.execute(["--yes", "--accept-bypass"], cleanEnv({ home, repoRoot, output }));
  assert.equal(code, 0);

  const cfg = readConfig(path.join(home, ".hermad", "config.json"));
  assert.equal(cfg.permissions.mode, "bypass");
  assert.match(cfg.permissions.acceptedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(output.join("\n").includes(DICTS.en["perm.change"]), "imprime la pantalla de riesgo completa antes de aplicar");
});

test("sin vendors aborta con exit 1 sin tocar disco (FR-3.4, ux §12.2)", async () => {
  const home = tmp("setup-home-");
  const output = [];
  const code = await setup.execute(["--yes"], cleanEnv({ home, repoRoot: fixtureRepo(), vendors: [], output }));
  assert.equal(code, 1);
  assert.ok(output.join("\n").includes(DICTS.en["err.novendor.title"]));
  assert.ok(!fs.existsSync(path.join(home, ".hermad", "config.json")));
  assert.ok(!fs.existsSync(path.join(home, ".hermad", "pack")));
});

test("Node viejo aborta con el mensaje bilingüe (ux §12.1)", async () => {
  const home = tmp("setup-home-");
  const output = [];
  const env = cleanEnv({ home, repoRoot: fixtureRepo(), output });
  env.detect = () => ({
    platform: "linux",
    node: { ok: false, version: "v18.20.0", required: "20.12" },
    herdr: { present: true, version: "1.0.0", install: "x" },
    vendors: [{ kind: "claude", experimental: false }],
  });
  const code = await setup.execute(["--yes"], env);
  assert.equal(code, 1);
  const text = output.join("\n");
  assert.ok(text.includes("hermad necesita Node 20.12 o superior (tienes v18.20.0)"), "mensaje es");
  assert.ok(text.includes("hermad needs Node 20.12 or newer (you have v18.20.0)"), "mensaje en");
  assert.ok(!fs.existsSync(path.join(home, ".hermad", "config.json")));
});
