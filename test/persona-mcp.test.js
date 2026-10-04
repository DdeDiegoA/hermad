"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { test } = require("node:test");
const render = require("../src/lib/render");
const vendors = require("../src/lib/vendors");
const { loadPersona } = require("../src/lib/prompts");

const CFG = { userName: "", language: "en", permissions: { mode: "prompt" }, mcpServers: { "open-design": { command: "od", args: ["mcp"] } } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hermad-mcp-"));

function quiet(fn) {
  const logs = [];
  const orig = console.log;
  console.log = (m) => logs.push(String(m));
  try {
    return { out: fn(), logs };
  } finally {
    console.log = orig;
  }
}

test("ux declara open-design como MCP propio; las demás personas no", () => {
  assert.deepEqual(loadPersona("ux").mcp, ["open-design"]);
  for (const p of ["dev", "reviewer", "architect", "pm", "analyst", "reader", "orquestador", "security"]) assert.deepEqual(loadPersona(p).mcp, [], p);
});

test("claude: ux recibe --mcp-config con su servidor; dev no", () => {
  const dir = tmp();
  const persona = { kind: "claude", modelFlag: "", rol: "x" };
  const ux = quiet(() => render.renderPersona({ projectDir: dir, name: "ux", persona, config: CFG })).out;
  assert.ok(ux.claude.mcpFile, "ux debe tener mcpFile");
  assert.deepEqual(JSON.parse(fs.readFileSync(ux.claude.mcpFile, "utf8")).mcpServers, CFG.mcpServers);
  const args = vendors.startPlan("claude", "ux", persona, ux).args;
  assert.equal(args[args.indexOf("--mcp-config") + 1], ux.claude.mcpFile);

  const dev = quiet(() => render.renderPersona({ projectDir: dir, name: "dev", persona, config: CFG })).out;
  assert.equal(dev.claude.mcpFile, null);
  assert.ok(!vendors.startPlan("claude", "dev", persona, dev).args.includes("--mcp-config"));
});

test("opencode: avisa que no puede acotar el MCP por persona", () => {
  const { logs } = quiet(() => render.renderPersona({ projectDir: tmp(), name: "ux", persona: { kind: "opencode", modelFlag: "", rol: "x" }, config: CFG }));
  assert.ok(logs.some((l) => l.includes("no los acota por persona")), logs.join("\n"));
});

test("MCP pedido pero no definido en config: warning y sin archivo", () => {
  const { out, logs } = quiet(() => render.renderPersona({ projectDir: tmp(), name: "ux", persona: { kind: "claude", modelFlag: "", rol: "x" }, config: { ...CFG, mcpServers: {} } }));
  assert.equal(out.claude.mcpFile, null);
  assert.ok(logs.some((l) => l.includes("no está en mcpServers")));
});
