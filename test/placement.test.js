"use strict";
const assert = require("assert");
const { test } = require("node:test");
const { departmentFor, gridPlacement, moveToDepartment, paneForAgent } = require("../src/lib/placement");

const PROJECT = { departamentos: [["producto", ["architect", "pm"]], ["desarrollo", ["dev"]], ["qa", ["reviewer"]]] };

test("departmentFor ubica la persona en el tab de su departamento", () => {
  assert.equal(departmentFor(PROJECT, "pm"), "producto");
  assert.equal(departmentFor(PROJECT, "dev"), "desarrollo");
  assert.equal(departmentFor(PROJECT, "reviewer"), "qa");
});

test("departmentFor normaliza el agente a la persona base (dev-3 → dev)", () => {
  assert.equal(departmentFor(PROJECT, "dev-3"), "desarrollo");
  assert.equal(departmentFor({}, "dev-2"), "desarrollo");
  assert.equal(departmentFor(PROJECT, "reviewer-opencode"), "qa");
});

test("departmentFor cae en DEFAULT_DEPARTAMENTOS: reader → producto", () => {
  assert.equal(departmentFor(PROJECT, "reader"), "producto", "reader no está en el proyecto → default");
  assert.equal(departmentFor({}, "reader"), "producto");
  assert.equal(departmentFor({}, "dev"), "desarrollo", "proyecto sin departamentos usa defaults");
  assert.equal(departmentFor({}, "ux"), "diseno");
});

test("departmentFor avisa e ignora la etiqueta gerencia", () => {
  const logs = [];
  const p = { departamentos: [["gerencia", ["dev"]], ["desarrollo", ["dev"]]] };
  assert.equal(departmentFor(p, "dev", { log: (m) => logs.push(m) }), "desarrollo");
  assert.ok(logs.some((m) => /gerencia/.test(m)), "avisó que gerencia está reservado");
});

test("departmentFor nunca null si hay departamentos", () => {
  assert.equal(departmentFor({ departamentos: [["producto", ["pm"]]] }, "desconocido"), "producto", "primer tab no reservado");
  assert.equal(departmentFor({ defaultDepartment: "qa", departamentos: [["producto", ["pm"]]] }, "desconocido"), "qa");
  assert.equal(departmentFor({ departamentos: [["gerencia", ["dev"]]] }, "desconocido"), null, "solo un tab reservado");
  assert.equal(departmentFor({}, "desconocido"), null, "sin departamentos ni default para la persona");
});

test("gridPlacement reproduce la grilla 4×2", () => {
  const p = (id) => ({ pane_id: id, tab_id: "t" });
  assert.deepEqual(gridPlacement([]), {});
  assert.deepEqual(gridPlacement([p("p1")]), { targetPane: "p1", split: "right" });
  assert.deepEqual(gridPlacement([p("p1"), p("p2"), p("p3")]), { targetPane: "p3", split: "right" });
  assert.deepEqual(gridPlacement([p("p1"), p("p2"), p("p3"), p("p4")]), { targetPane: "p1", split: "down" });
  assert.deepEqual(gridPlacement([p("p1"), p("p2"), p("p3"), p("p4"), p("p5")]), { targetPane: "p2", split: "down" });
});

test("moveToDepartment sin workspaceId deja el pane donde estaba", () => {
  const moved = moveToDepartment(PROJECT, "dev", "p0", { tabList: () => { throw new Error("no debería llamarse"); } });
  assert.equal(moved, "p0");
});

test("moveToDepartment mueve al tab del departamento respetando la grilla", () => {
  const calls = [];
  const moved = moveToDepartment(PROJECT, "dev", "p0", {
    workspaceId: "w1",
    tabList: () => [{ tab_id: "w1:t3", label: "desarrollo" }],
    paneList: () => [{ pane_id: "w1:p1", tab_id: "w1:t3" }, { pane_id: "w1:p2", tab_id: "w1:t9" }],
    paneMove: (id, opts) => {
      calls.push([id, opts]);
      return { paneId: "w1:p9" };
    },
    log: () => {},
  });
  assert.equal(moved, "w1:p9");
  assert.deepEqual(calls[0][1], { tab: "w1:t3", targetPane: "w1:p1", split: "right" });
});

test("moveToDepartment cae a move sin target si la grilla falla", () => {
  const calls = [];
  const moved = moveToDepartment(PROJECT, "dev", "p0", {
    workspaceId: "w1",
    tabList: () => [{ tab_id: "t", label: "desarrollo" }],
    paneList: () => [{ pane_id: "w1:p1", tab_id: "t" }],
    paneMove: (id, opts) => {
      calls.push(opts);
      if (opts.targetPane) throw new Error("no splits");
      return { paneId: "w1:p2" };
    },
    log: () => {},
  });
  assert.equal(moved, "w1:p2");
  assert.equal(calls.length, 2, "intentó grilla y luego sin target");
});

test("moveToDepartment devuelve null cuando no puede mover", () => {
  const base = { workspaceId: "w1", paneMove: () => ({ paneId: "x" }), log: () => {} };
  assert.equal(
    moveToDepartment(PROJECT, "dev", "p0", { ...base, tabList: () => [{ tab_id: "t", label: "otro" }] }),
    null,
    "tab no encontrado"
  );
  assert.equal(
    moveToDepartment(PROJECT, "dev", "p0", { ...base, tabList: () => { throw new Error("boom"); } }),
    null,
    "tabList tiró"
  );
  assert.equal(
    moveToDepartment(PROJECT, "dev", "p0", {
      ...base,
      tabList: () => [{ tab_id: "t", label: "desarrollo" }],
      paneMove: () => { throw new Error("boom"); },
    }),
    null,
    "paneMove tiró en los dos intentos"
  );
});

test("paneForAgent con tab existente divide desde el daemon y mueve a la grilla", () => {
  const calls = [];
  const paneId = paneForAgent(PROJECT, "dev", {
    workspaceId: "w1",
    daemonPaneId: "w1:p0",
    cwd: "/repo",
    tabList: () => [{ tab_id: "w1:t3", label: "desarrollo" }],
    paneList: () => [{ pane_id: "w1:p1", tab_id: "w1:t3" }],
    paneSplit: (id, dir) => {
      calls.push(["split", id, dir]);
      return { paneId: "w1:new" };
    },
    paneMove: (id, opts) => {
      calls.push(["move", id, opts]);
      return { paneId: "w1:p9" };
    },
    log: () => {},
  });
  assert.equal(paneId, "w1:p9");
  assert.deepEqual(calls[0], ["split", "w1:p0", "down"]);
  assert.equal(calls[1][0], "move");
});

test("paneForAgent crea el tab del departamento si no existe (on-demand)", () => {
  let split = false;
  const paneId = paneForAgent(PROJECT, "reviewer", {
    workspaceId: "w1",
    daemonPaneId: "w1:p0",
    cwd: "/repo",
    tabList: () => [{ tab_id: "w1:t1", label: "default" }],
    tabCreate: (_ws, _cwd, label) => ({ rootPaneId: `w1:root-${label}` }),
    paneSplit: () => {
      split = true;
      return { paneId: "x" };
    },
    log: () => {},
  });
  assert.equal(paneId, "w1:root-qa");
  assert.equal(split, false, "no divide: el agente arranca en el root del tab nuevo (sin pane vacío)");
});

test("paneForAgent ubica a reader en producto aunque el proyecto no lo liste", () => {
  const paneId = paneForAgent(PROJECT, "reader", {
    workspaceId: "w1",
    daemonPaneId: "w1:p0",
    cwd: "/repo",
    tabList: () => [{ tab_id: "w1:t1", label: "producto" }],
    paneList: () => [],
    paneSplit: () => ({ paneId: "w1:new" }),
    paneMove: () => ({ paneId: "w1:p9" }),
    log: () => {},
  });
  assert.equal(paneId, "w1:p9");
});

test("paneForAgent cierra el pane temporal y devuelve null si el move falla", () => {
  const closed = [];
  const paneId = paneForAgent(PROJECT, "dev", {
    workspaceId: "w1",
    daemonPaneId: "w1:p0",
    cwd: "/repo",
    tabList: () => [{ tab_id: "w1:t3", label: "desarrollo" }],
    paneList: () => [],
    paneSplit: () => ({ paneId: "w1:tmp" }),
    paneMove: () => { throw new Error("no moves"); },
    paneClose: (id) => {
      closed.push(id);
      return { ok: true };
    },
    log: () => {},
  });
  assert.equal(paneId, null);
  assert.deepEqual(closed, ["w1:tmp"], "cerró el pane temporal");
});

test("paneForAgent sin departamentos posibles devuelve null (no contamina el tab default)", () => {
  const paneId = paneForAgent({}, "desconocido", {
    workspaceId: "w1",
    daemonPaneId: "w1:p0",
    tabList: () => [{ tab_id: "t1", label: "default" }],
    paneSplit: () => ({ paneId: "x" }),
    log: () => {},
  });
  assert.equal(paneId, null);
});

test("paneForAgent sin workspace devuelve null", () => {
  assert.equal(paneForAgent(PROJECT, "dev", { tabList: () => [] }), null);
});
