"use strict";
const { execFileSync } = require("child_process");

function ensureInstalled() {
  try {
    execFileSync("which", ["herdr"], { stdio: "ignore" });
  } catch {
    throw new Error("herdr no instalado: brew install herdr");
  }
}

// herdr siempre imprime JSON, pero en éxito va a stdout y en error va a STDERR
// (confirmado en vivo: `herdr agent start ... 2>/dev/null` no imprime nada, el
// JSON de error solo sale por stderr) — por eso hay que mirar los dos, si no el
// catch de abajo tira la excepción cruda de execFileSync y ni entra al retry.
function call(args) {
  let out;
  try {
    out = execFileSync("herdr", args, { encoding: "utf8" });
  } catch (err) {
    out = err.stdout || err.stderr;
    if (!out) throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch {
    throw new Error(`respuesta no-JSON de "herdr ${args.join(" ")}": ${out}`);
  }
  if (parsed.error) {
    const e = new Error(parsed.error.message || parsed.error.code || "herdr error");
    e.code = parsed.error.code;
    e.herdrError = parsed.error;
    throw e;
  }
  return parsed.result;
}

function workspaceCreate(cwd, label) {
  const r = call(["workspace", "create", "--cwd", cwd, "--label", label, "--no-focus"]);
  return { workspaceId: r.workspace.workspace_id, rootPaneId: r.root_pane.pane_id };
}

function tabCreate(workspaceId, cwd, label) {
  const r = call(["tab", "create", "--workspace", workspaceId, "--cwd", cwd, "--label", label, "--no-focus"]);
  return { rootPaneId: r.root_pane.pane_id };
}

function paneSplit(paneId, direction, { cwd } = {}) {
  const args = ["pane", "split", paneId, "--direction", direction, "--no-focus"];
  if (cwd) args.push("--cwd", cwd);
  const r = call(args);
  return { paneId: r.pane.pane_id };
}

function tabList(workspaceId) {
  const args = ["tab", "list"];
  if (workspaceId) args.push("--workspace", workspaceId);
  return call(args).tabs || [];
}

function paneList(workspaceId) {
  const args = ["pane", "list"];
  if (workspaceId) args.push("--workspace", workspaceId);
  return call(args).panes || [];
}

// Mueve un pane a otro tab del mismo workspace. El id puede cambiar: usar el
// devuelto (`move_result.pane.pane_id`), no el anterior.
function paneMove(paneId, { tab, targetPane, split } = {}) {
  const args = ["pane", "move", paneId, "--no-focus"];
  if (tab) args.push("--tab", tab);
  if (targetPane) args.push("--target-pane", targetPane);
  if (split) args.push("--split", split);
  const r = call(args);
  const moved = (r.move_result && r.move_result.pane && r.move_result.pane.pane_id) || (r.pane && r.pane.pane_id) || paneId;
  return { paneId: moved };
}

// sleep sincrónico (sin async) — reusa el patrón execFileSync que ya usa este
// módulo en vez de meter una dependencia o volver todo el CLI async por esto.
function sleepMs(ms) {
  execFileSync("sleep", [(ms / 1000).toString()]);
}

// vendorArgs can be a plain string like "--model opus" (split on spaces) or an
// argv array like ["--model", "opus", "--append-system-prompt", "..."] when the
// argument must stay intact as a single token.
//
// Un pane recién creado (workspace/tab/split) tarda en estar "at its interactive
// shell prompt" — confirmado en vivo: herdr rechaza con agent_pane_busy justo
// después de crear el pane. Cuánto tarda varía mucho: desde una terminal ya
// abierta (herdr solo agrega un pane) es rápido, pero desde "terminal en bruto"
// (sin ningún workspace herdr abierto todavía) herdr tiene que levantar la
// ventana/proceso de terminal entero — con rc files pesados (oh-my-zsh, nvm,
// pyenv, etc.) esto puede tardar bastante más de unos pocos segundos. Por eso el
// budget de reintento es generoso (~40s, mismo orden que el timeout default de
// `herdr agent start --timeout`) en vez de un puñado de reintentos cortos.
function agentStart(name, kind, paneId, vendorArgs, { retries = 40, retryDelayMs = 1000 } = {}) {
  const args = ["agent", "start", name, "--kind", kind, "--pane", paneId];
  const extra = Array.isArray(vendorArgs) ? vendorArgs : (vendorArgs || "").split(" ").filter(Boolean);
  if (extra.length) args.push("--", ...extra);

  for (let attempt = 0; ; attempt++) {
    try {
      return call(args);
    } catch (err) {
      if (err.code === "agent_pane_busy" && attempt < retries) {
        if (attempt === 0 || (attempt + 1) % 5 === 0) {
          console.log(`    ... ${paneId} todavía no tiene shell lista, reintentando (${attempt + 1}/${retries})`);
        }
        sleepMs(retryDelayMs);
        continue;
      }
      throw err;
    }
  }
}

function agentPrompt(name, text) {
  return call(["agent", "prompt", name, text]);
}

function agentWait(name, untilStates, timeoutMs) {
  const args = ["agent", "wait", name];
  for (const state of untilStates) args.push("--until", state);
  if (timeoutMs != null) args.push("--timeout", timeoutMs.toString());
  return call(args);
}

// `pane run` recién creado puede no tener shell lista todavía.
function paneRun(paneId, command, { retries = 20, retryDelayMs = 1000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return call(["pane", "run", paneId, command]);
    } catch (err) {
      if (err.code === "pane_busy" && attempt < retries) {
        sleepMs(retryDelayMs);
        continue;
      }
      throw err;
    }
  }
}

function agentList() {
  const r = call(["agent", "list"]);
  return r.agents || [];
}

function agentRead(name, { source = "visible", lines } = {}) {
  const args = ["agent", "read", name, "--source", source];
  if (lines != null) args.push("--lines", String(lines));
  const r = call(args);
  return (r.read && r.read.text) || r.text || "";
}

module.exports = { ensureInstalled, workspaceCreate, tabCreate, paneSplit, tabList, paneList, paneMove, agentStart, agentPrompt, agentWait, paneRun, agentList, agentRead };
