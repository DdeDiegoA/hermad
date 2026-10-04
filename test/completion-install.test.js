"use strict";
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");

const completion = require("../src/lib/completion/install");

const HOME = path.join(path.sep === "\\" ? "C:\\home" : "/home", "u");
const zshFile = path.join(HOME, ".zfunc", "_hermad");
const zshRc = path.join(HOME, ".zshrc");
const bashFile = path.join(HOME, ".local", "share", "bash-completion", "completions", "hermad");
const fishFile = path.join(HOME, ".config", "fish", "completions", "hermad.fish");

// fs en memoria: install/uninstall nunca tocan el disco real en los tests (NFR-3).
function memFs(initial = {}) {
  const files = { ...initial };
  return {
    files,
    existsSync: (p) => Object.prototype.hasOwnProperty.call(files, p),
    readFileSync: (p) => {
      if (!Object.prototype.hasOwnProperty.call(files, p)) throw new Error("ENOENT " + p);
      return files[p];
    },
    writeFileSync: (p, c) => {
      files[p] = String(c);
    },
    mkdirSync: () => {},
    rmSync: (p) => {
      delete files[p];
    },
    unlinkSync: (p) => {
      delete files[p];
    },
  };
}

const yes = async () => true;
const no = async () => false;
const quiet = () => {};

test("detectShell: $SHELL, pwsh y $PSModulePath (FR-6.5)", () => {
  assert.equal(completion.detectShell({ env: { SHELL: "/bin/zsh" } }), "zsh");
  assert.equal(completion.detectShell({ env: { SHELL: "/usr/bin/bash" } }), "bash");
  assert.equal(completion.detectShell({ env: { SHELL: "/usr/bin/fish" } }), "fish");
  assert.equal(completion.detectShell({ env: { SHELL: "/usr/bin/pwsh" } }), "powershell");
  assert.equal(completion.detectShell({ env: { PSModulePath: "C:\\Program Files\\PowerShell" } }), "powershell");
  assert.equal(completion.detectShell({ env: {}, platform: "linux" }), null);
});

test("install zsh escribe archivo + bloque; repetir es idempotente (FR-6.2, NFR-8)", async () => {
  const fs = memFs();
  const first = await completion.install("zsh", { fs, home: HOME, log: quiet, confirm: yes });
  assert.ok(first.installed);
  assert.match(fs.files[zshFile], /^#compdef hermad/);
  assert.match(fs.files[zshRc], /# >>> hermad >>>/);

  const snapshot = { ...fs.files };
  await completion.install("zsh", { fs, home: HOME, log: quiet, confirm: yes });
  assert.deepEqual(fs.files, snapshot, "segunda corrida no debe cambiar archivos");
  assert.equal((fs.files[zshRc].match(/# >>> hermad >>>/g) || []).length, 1, "no duplica el bloque");
});

test("uninstall borra el archivo y el bloque, deja el resto del rc (FR-6.2)", async () => {
  const fs = memFs({ [zshRc]: "# mi rc\nexport X=1\n" });
  await completion.install("zsh", { fs, home: HOME, log: quiet, confirm: yes });
  completion.uninstall("zsh", { fs, home: HOME, log: quiet });
  assert.ok(!fs.files[zshFile], "borra el archivo de completion");
  assert.ok(!/# >>> hermad >>>/.test(fs.files[zshRc]), "borra el bloque");
  assert.equal(fs.files[zshRc], "# mi rc\nexport X=1\n", "el resto del rc queda igual");
});

test("muestra el plan (archivo + cambio) antes de preguntar (FR-6.5)", async () => {
  const fs = memFs();
  const order = [];
  await completion.install("bash", {
    fs,
    home: HOME,
    log: (m) => order.push(["log", m]),
    confirm: async () => {
      order.push(["confirm"]);
      return true;
    },
  });
  const planIdx = order.findIndex(([k, m]) => k === "log" && m.includes("Haría esto") && m.includes(bashFile));
  const confirmIdx = order.findIndex(([k]) => k === "confirm");
  assert.ok(planIdx !== -1, "el plan debe listar el archivo");
  assert.ok(confirmIdx !== -1 && planIdx < confirmIdx, "plan antes de la confirmacion");
});

test("install detecta el shell y no toca rc en fish (autoload)", async () => {
  const fs = memFs();
  const res = await completion.install(null, {
    fs,
    home: HOME,
    env: { SHELL: "/usr/bin/fish" },
    log: quiet,
    confirm: yes,
  });
  assert.equal(res.shell, "fish");
  assert.ok(fs.files[fishFile], "escribe el archivo de fish");
  assert.ok(!fs.files[path.join(HOME, ".config", "fish", "config.fish")], "no crea config.fish");
});

test("PowerShell Restricted: avisa y no toca el perfil (FR-6.5, NFR-7)", async () => {
  const fs = memFs();
  const logs = [];
  const res = await completion.install("powershell", {
    fs,
    home: HOME,
    log: (m) => logs.push(m),
    confirm: yes,
    exec: () => "Restricted",
  });
  assert.equal(res.installed, false);
  assert.equal(res.reason, "restricted");
  assert.deepEqual(fs.files, {}, "no escribió nada");
  assert.ok(logs.some((m) => /Restricted/.test(m)));
});

test("PowerShell escribe en los perfiles existentes de pwsh y 5.1", async () => {
  const rc1 = path.join(HOME, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1");
  const rc2 = path.join(HOME, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1");
  const fs = memFs({ [rc1]: "", [rc2]: "" });
  await completion.install("powershell", {
    fs,
    home: HOME,
    log: quiet,
    confirm: yes,
    exec: () => "RemoteSigned",
  });
  assert.match(fs.files[path.join(HOME, ".hermad", "completion", "hermad.ps1")], /Register-ArgumentCompleter/);
  assert.match(fs.files[rc1], /# >>> hermad >>>/);
  assert.match(fs.files[rc2], /# >>> hermad >>>/);
});

test("si el usuario dice no, no escribe nada", async () => {
  const fs = memFs();
  const res = await completion.install("bash", { fs, home: HOME, log: quiet, confirm: no });
  assert.equal(res.installed, false);
  assert.deepEqual(fs.files, {});
});

test("upsertBlock/stripBlock no duplican ni rompen el resto (NFR-8)", () => {
  const block = `${completion.MARK_START}\nx\n${completion.MARK_END}`;
  const once = completion.upsertBlock("keep\n", block);
  assert.equal(completion.upsertBlock(once, block), once, "idempotente");
  assert.equal(completion.stripBlock(once), "keep\n", "strip deja el resto");
});
