"use strict";
// Adaptador de UI del wizard. Tres implementaciones con la misma interfaz
// (intro/outro/note/select/multiselect/confirm/text/spinner/cancelled):
//   clack    → TTY, `@clack/prompts` por import() dinámico (única dep, FR-3.1).
//   headless → `--yes` o stdin no-TTY: devuelve defaults, nunca pregunta (FR-3.3).
//   readline → si clack no carga (clone sin npm install): modo simple.
// El resto del CLI NO importa clack ni este módulo.
const { t } = require("../lib/i18n");

// Input faltante en modo headless: setup la convierte en exit 2 (nunca se cuelga).
class NeedsInput extends Error {
  constructor(key, flag) {
    super(`falta información para continuar sin terminal: ${key}`);
    this.name = "NeedsInput";
    this.key = key;
    this.flag = flag || null;
  }
}

const NEEDS_INPUT_EXIT = 2;

function option(o) {
  return typeof o === "string" ? { value: o, label: o } : o;
}

function isTTY(stdin) {
  return Boolean(stdin && stdin.isTTY);
}

function defaultLoadClack() {
  return import("@clack/prompts");
}

// --- headless: defaults, sin interacción. Pregunta sin `defaultValue` → NeedsInput.
function headless(io) {
  const emit = (s) => io.stdout.write(s + "\n");
  const value = (q) => {
    if (q.defaultValue === undefined) throw new NeedsInput(q.key, q.flag);
    return q.defaultValue;
  };
  const spinner = () => ({
    start(msg) {
      if (msg) emit(msg);
    },
    message(msg) {
      if (msg) emit(msg);
    },
    stop(msg) {
      if (msg) emit(msg);
    },
  });
  return {
    mode: "headless",
    intro: async (msg) => emit(msg),
    outro: async (msg) => emit(msg),
    note: async (msg, title) => emit(title ? `${title}\n${msg}` : msg),
    select: async (q) => value(q),
    multiselect: async (q) => {
      const v = value(q);
      return Array.isArray(v) ? v : [];
    },
    confirm: async (q) => Boolean(value(q)),
    text: async (q) => String(value(q)),
    spinner,
    cancelled: () => false,
  };
}

// --- clack: interfaz moderna. `isCancel` → cancelled(v) para que el paso reaccione.
function clackUI(io, clack) {
  const spinner = () => {
    const s = clack.spinner();
    return {
      start(msg) {
        s.start(msg);
      },
      message(msg) {
        s.message(msg);
      },
      stop(msg) {
        if (msg) s.message(msg);
        s.stop(msg);
      },
    };
  };
  return {
    mode: "clack",
    intro: async (msg) => clack.intro(msg),
    outro: async (msg) => clack.outro(msg),
    note: async (msg, title) => clack.note(msg, title),
    select: async (q) => clack.select({ message: q.message, options: (q.options || []).map(option), initialValue: q.defaultValue }),
    multiselect: async (q) =>
      clack.multiselect({ message: q.message, options: (q.options || []).map(option), initialValues: q.defaultValue || [], required: false }),
    confirm: async (q) => clack.confirm({ message: q.message, initialValue: Boolean(q.defaultValue) }),
    text: async (q) => clack.text({ message: q.message, defaultValue: q.defaultValue, placeholder: q.placeholder }),
    spinner,
    cancelled: (v) => clack.isCancel(v),
  };
}

// --- readline: fallback sin clack. Listas numeradas (texto plano, ux §12.4).
function readlineUI(io, lang) {
  const rl = require("readline");
  const yes = lang === "es" ? "sí" : "yes";

  function ask(question) {
    return new Promise((resolve) => {
      const r = rl.createInterface({ input: io.stdin, output: io.stdout });
      let answered = false;
      r.question(question, (a) => {
        answered = true;
        r.close();
        resolve(String(a).trim());
      });
      r.on("close", () => {
        if (!answered) resolve("");
      });
    });
  }

  const emit = (s) => io.stdout.write(s + "\n");
  const list = (options, defaults) =>
    (options || []).map((o, i) => {
      const opt = option(o);
      return `${defaults && defaults.includes(opt.value) ? "◼" : "◻"} ${i + 1}) ${opt.label}`;
    });

  return {
    mode: "readline",
    intro: async (msg) => emit(msg),
    outro: async (msg) => emit(msg),
    note: async (msg, title) => emit(title ? `${title}\n${msg}` : msg),
    select: async (q) => {
      const options = (q.options || []).map(option);
      emit(q.message);
      options.forEach((o, i) => emit(`  ${i + 1}) ${o.label}`));
      const a = await ask(`Elige [1-${options.length}]: `);
      const idx = a === "" ? options.findIndex((o) => o.value === q.defaultValue) : parseInt(a, 10) - 1;
      return (options[idx >= 0 ? idx : 0] || {}).value;
    },
    multiselect: async (q) => {
      const options = (q.options || []).map(option);
      emit(q.message);
      list(options, q.defaultValue).forEach(emit);
      const a = await ask("Números separados por comas, enter = ninguno: ");
      if (a === "") return q.defaultValue || [];
      return a
        .split(",")
        .map((n) => parseInt(n.trim(), 10) - 1)
        .filter((i) => i >= 0 && i < options.length)
        .map((i) => options[i].value);
    },
    confirm: async (q) => {
      const def = Boolean(q.defaultValue);
      const a = await ask(`${q.message} [${def ? yes : "y"}/${def ? "n" : "N"}] `);
      if (a === "") return def;
      return /^(s|si|sí|y|yes)$/i.test(a);
    },
    text: async (q) => {
      const a = await ask(`${q.message} `);
      return a === "" ? (q.defaultValue === undefined ? "" : String(q.defaultValue)) : a;
    },
    spinner: () => ({
      start: (msg) => msg && emit(msg),
      message: (msg) => msg && emit(msg),
      stop: (msg) => msg && emit(msg),
    }),
    cancelled: () => false,
  };
}

// createUI: elige adaptador. `loadClack` inyectable para probar el fallback.
async function createUI({ yes = false, io, lang = "en", loadClack = defaultLoadClack } = {}) {
  const stream = io || { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr };
  if (yes || !isTTY(stream.stdin)) return headless(stream);
  try {
    const clack = await loadClack();
    return clackUI(stream, clack);
  } catch {
    stream.stderr.write(t(lang, "wizard.clack.fallback") + "\n");
    return readlineUI(stream, lang);
  }
}

module.exports = { NeedsInput, NEEDS_INPUT_EXIT, createUI, headless, readlineUI, clackUI, isTTY };
