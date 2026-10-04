"use strict";
const assert = require("assert");
const { test } = require("node:test");
const { createUI, headless, NeedsInput, NEEDS_INPUT_EXIT } = require("../src/wizard/ui");

function fakeIO({ tty = true } = {}) {
  const out = [];
  const err = [];
  return {
    io: {
      stdin: { isTTY: tty },
      stdout: { write: (s) => out.push(s) },
      stderr: { write: (s) => err.push(s) },
    },
    out,
    err,
  };
}

const throwingClack = async () => {
  throw new Error("no hay @clack/prompts");
};

test("--yes usa el adaptador headless y no pregunta nunca (FR-3.3)", async () => {
  const { io } = fakeIO({ tty: true });
  const ui = await createUI({ yes: true, io });
  assert.equal(ui.mode, "headless");
  assert.equal(await ui.select({ key: "k", message: "?", options: ["a", "b"], defaultValue: "b" }), "b");
  assert.equal(await ui.confirm({ key: "k", message: "?", defaultValue: false }), false);
  assert.equal(await ui.text({ key: "k", message: "?", defaultValue: "" }), "");
  assert.deepEqual(await ui.multiselect({ key: "k", message: "?", options: ["a"], defaultValue: [] }), []);
});

test("stdin no-TTY usa headless aunque no haya --yes (FR-3.3)", async () => {
  const { io } = fakeIO({ tty: false });
  const ui = await createUI({ yes: false, io, loadClack: throwingClack });
  assert.equal(ui.mode, "headless");
});

test("una pregunta sin default lanza NeedsInput con su key y flag (FR-3.3)", async () => {
  const ui = headless(fakeIO().io);
  await assert.rejects(() => ui.select({ key: "lang", flag: "--lang", message: "?" }), (err) => {
    assert.ok(err instanceof NeedsInput, "es NeedsInput");
    assert.equal(err.key, "lang");
    assert.equal(err.flag, "--lang");
    return true;
  });
  await assert.rejects(() => ui.confirm({ key: "perm", message: "?" }), NeedsInput);
  assert.equal(NEEDS_INPUT_EXIT, 2, "setup sale 2 con input faltante");
});

test("headless imprime notas y spinners a stdout sin colgarse", async () => {
  const { io, out } = fakeIO();
  const ui = headless(io);
  await ui.intro("hola");
  await ui.note("cuerpo", "título");
  await ui.outro("chau");
  const sp = ui.spinner();
  sp.start("copiando");
  sp.stop("listo");
  const text = out.join("\n");
  for (const s of ["hola", "cuerpo", "título", "chau", "copiando", "listo"]) assert.ok(text.includes(s), `falta "${s}"`);
});

test("si clack no carga cae a readline con aviso (FR-3.1, ux §12.4)", async () => {
  const { io, err } = fakeIO({ tty: true });
  const ui = await createUI({ yes: false, io, lang: "es", loadClack: throwingClack });
  assert.equal(ui.mode, "readline");
  assert.match(err.join(""), /interfaz moderna/);
});

test("con clack disponible usa la interfaz moderna y mapea opciones (FR-3.1)", async () => {
  const calls = [];
  const cancelSymbol = Symbol("cancel");
  const fakeClack = {
    intro: (m) => calls.push(["intro", m]),
    outro: (m) => calls.push(["outro", m]),
    note: (m, t) => calls.push(["note", m, t]),
    select: (o) => {
      calls.push(["select", o]);
      return o.initialValue;
    },
    multiselect: (o) => {
      calls.push(["multiselect", o]);
      return o.initialValues;
    },
    confirm: (o) => {
      calls.push(["confirm", o]);
      return o.initialValue;
    },
    text: (o) => o.defaultValue,
    spinner: () => ({ start() {}, message() {}, stop() {} }),
    isCancel: (v) => v === cancelSymbol,
  };
  const { io } = fakeIO({ tty: true });
  const ui = await createUI({ yes: false, io, loadClack: async () => fakeClack });
  assert.equal(ui.mode, "clack");
  assert.equal(await ui.select({ key: "k", message: "?", options: ["a", "b"], defaultValue: "b" }), "b");
  assert.deepEqual(calls[0][1].options, [
    { value: "a", label: "a" },
    { value: "b", label: "b" },
  ]);
  assert.equal(calls[0][1].initialValue, "b");
  assert.equal(ui.cancelled(cancelSymbol), true);
  assert.equal(ui.cancelled("no"), false);
});
