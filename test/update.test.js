"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { test } = require("node:test");
const update = require("../src/commands/update");
const createProject = require("../src/commands/create-project");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fixtureRepo({ version = "0.2.0" } = {}) {
  const dir = tmp("hermad-update-");
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ version, repository: { type: "git", url: "https://github.com/DdeDiegoA/hermad.git" } })
  );
  return dir;
}

function capture() {
  let buf = "";
  const io = {
    stdin: { isTTY: false },
    stdout: { write: (s) => (buf += s) },
    stderr: { write: (s) => (buf += s) },
  };
  return { io, out: () => buf };
}

function fakeUI({ confirm = true, cancelled = false, onConfirm } = {}) {
  return {
    mode: "headless",
    intro: async () => {},
    outro: async () => {},
    note: async () => {},
    select: async () => undefined,
    multiselect: async () => [],
    text: async () => "",
    confirm: async () => {
      if (onConfirm) onConfirm();
      return confirm;
    },
    spinner: () => ({ start() {}, message() {}, stop() {} }),
    cancelled: () => cancelled,
  };
}

const EN = { language: "en" };

test("update npm-global: reinstala desde GitHub y delega el relink al binario nuevo (FR-3.7, FR-7.4/7.5)", async () => {
  const repo = fixtureRepo();
  const calls = [];
  const { io, out } = capture();

  const res = await update.run([], {
    repoRoot: repo,
    config: EN,
    detect: () => "npm-global",
    currentVersion: () => "0.2.0",
    availableVersion: async () => "0.5.0",
    which: () => true,
    exec: (bin, args, opts = {}) => calls.push({ bin, args, cwd: opts.cwd }),
    ui: fakeUI(),
    io,
  });

  assert.equal(res.updated, true);
  assert.deepEqual(calls[0], { bin: "npm", args: ["install", "-g", "github:DdeDiegoA/hermad"], cwd: undefined });
  assert.deepEqual(calls[1], { bin: "hermad", args: ["setup", "--relink-only"], cwd: undefined }, "relink por el binario nuevo");
  assert.ok(!fs.existsSync(path.join(repo, ".git")), "no exige clone git ni aborta (FR-7.5)");
  assert.match(out(), /0\.5\.0/);
  assert.match(out(), /github:DdeDiegoA\/hermad/);
});

test("update git: git pull --ff-only + npm install --omit=dev y después pack.install/relink (FR-7.4, A4)", async () => {
  const repo = fixtureRepo();
  fs.mkdirSync(path.join(repo, ".git"));
  const calls = [];
  const packCalls = [];
  let relinkVendors = null;

  const res = await update.run([], {
    repoRoot: repo,
    config: EN,
    detect: () => "git",
    currentVersion: () => "0.2.0",
    availableVersion: async () => "0.5.0",
    exec: (bin, args, opts = {}) => calls.push({ bin, args, cwd: opts.cwd }),
    packInstall: (opts) => packCalls.push(["install", opts.repoRoot]),
    packRelink: (opts) => {
      relinkVendors = opts.vendors;
      packCalls.push(["relink"]);
    },
    detectVendors: () => ["claude"],
    which: () => true,
    ui: fakeUI(),
    io: capture().io,
  });

  assert.equal(res.updated, true);
  assert.deepEqual(calls, [
    { bin: "git", args: ["pull", "--ff-only"], cwd: repo },
    { bin: "npm", args: ["install", "--omit=dev"], cwd: repo },
  ]);
  assert.deepEqual(packCalls, [["install", repo], ["relink"]]);
  assert.deepEqual(relinkVendors, ["claude"]);
});

test("update método desconocido: imprime los dos comandos manuales y no rompe (FR-7.4)", async () => {
  const repo = fixtureRepo();
  const { io, out } = capture();
  const res = await update.run([], { repoRoot: repo, config: EN, detect: () => "unknown", ui: fakeUI(), io });

  assert.equal(res.updated, false);
  assert.match(out(), /npm install -g github:DdeDiegoA\/hermad/);
  // el path puede venir con nombre corto en Windows → no lo metemos en un RegExp
  assert.ok(out().includes("git -C ") && out().includes("pull --ff-only"), "imprime el comando de clone");
});

test("update muestra actual vs disponible y el comando exacto antes de confirmar (FR-3.7)", async () => {
  const repo = fixtureRepo();
  const { io, out } = capture();
  let atConfirm = "";
  const res = await update.run([], {
    repoRoot: repo,
    config: EN,
    detect: () => "npm-global",
    currentVersion: () => "0.2.0",
    availableVersion: async () => "0.5.0",
    which: () => true,
    exec: () => "",
    ui: fakeUI({ onConfirm: () => (atConfirm = out()) }),
    io,
  });

  assert.equal(res.updated, true);
  assert.match(atConfirm, /Current version: 0\.2\.0/);
  assert.match(atConfirm, /Available version: 0\.5\.0/);
  assert.match(atConfirm, /I'll run: npm install -g github:DdeDiegoA\/hermad/, "comando exacto antes del confirm");
});

test("update sin red avisa y no bloquea (FR-3.7)", async () => {
  const repo = fixtureRepo();
  const { io, out } = capture();
  const res = await update.run([], {
    repoRoot: repo,
    config: EN,
    detect: () => "npm-global",
    currentVersion: () => "0.2.0",
    availableVersion: async () => {
      throw new Error("sin red");
    },
    which: () => true,
    exec: () => "",
    ui: fakeUI(),
    io,
  });

  assert.equal(res.updated, true, "actualiza igual");
  assert.match(out(), /couldn't check the available version/);
});

test("update: cancelar imprime No changes y no ejecuta nada", async () => {
  const repo = fixtureRepo();
  const { io, out } = capture();
  let ran = 0;
  const res = await update.run([], {
    repoRoot: repo,
    config: EN,
    detect: () => "npm-global",
    currentVersion: () => "0.2.0",
    availableVersion: async () => "0.5.0",
    exec: () => ran++,
    ui: fakeUI({ confirm: false }),
    io,
  });

  assert.equal(res.updated, false);
  assert.equal(ran, 0);
  assert.match(out(), /No changes/);
});

test("create-project bmadPlan: idioma de config.language y tools por vendor detectado (FR-1.4)", () => {
  const es = createProject.bmadPlan({ config: { language: "es" }, args: [], detectedVendors: ["claude"] });
  assert.equal(es.install, false);
  assert.match(es.command, /--communication-language Spanish/);
  assert.match(es.command, /--tools claude-code/);

  const auto = createProject.bmadPlan({
    config: { language: "en", bmad: { autoInstall: true } },
    args: [],
    detectedVendors: ["opencode"],
    platform: "win32",
  });
  assert.equal(auto.install, true);
  assert.match(auto.command, /English/);
  assert.match(auto.command, /--tools opencode/);
  assert.deepEqual(auto.skillAdd, ["bmad-help"]);

  const flag = createProject.bmadPlan({ config: { language: "es" }, args: ["--run-bmad-install"], detectedVendors: [] });
  assert.equal(flag.install, true);
});
