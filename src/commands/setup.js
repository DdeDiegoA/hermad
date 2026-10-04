"use strict";
// `hermad setup` — wizard de 9 pasos (docs/hermad-para-todos-ux.md). Fase 1
// `collect` (pasos 1-6, no escribe nada) → fase 2 resumen (paso 7) → fase 3
// apply (paso 8) → paso 9 (completion + próximos pasos). Toda la UI viene del
// adaptador (`src/wizard/ui.js`); este comando es el único borde que decide el
// código de salida.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const config = require("../lib/config");
const pack = require("../lib/pack");
const detectLib = require("../lib/detect");
const completion = require("../lib/completion/install");
const skillsLib = require("../lib/skills");
const { createUI, NeedsInput, NEEDS_INPUT_EXIT } = require("../wizard/ui");
const { translator } = require("../lib/i18n");
const { CancelledError, SetupError, checkCancel } = require("../lib/prompt");

const language = require("../wizard/steps/language");
const prereqs = require("../wizard/steps/prereqs");
const vendorsStep = require("../wizard/steps/vendors");
const skillsStep = require("../wizard/steps/skills");
const permissionsStep = require("../wizard/steps/permissions");
const bmadStep = require("../wizard/steps/bmad");
const summaryStep = require("../wizard/steps/summary");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

// `--foo-bar` → `fooBar`; valor = siguiente token si no empieza con `--`.
function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!a.startsWith("--")) continue;
    const name = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[name] = next;
      i += 1;
    } else {
      flags[name] = true;
    }
  }
  return flags;
}

// Vendor real para el consentimiento LLM del paso de skills (FR-2.4). Inyectable.
function realCallVendor(kind, model, promptText) {
  const run = (bin, argv) => execFileSync(bin, argv, { encoding: "utf8", timeout: 180000, stdio: ["ignore", "pipe", "pipe"] });
  const modelArgs = model ? ["--model", model] : [];
  if (kind === "opencode") return run("opencode", ["run", promptText, ...(model ? ["-m", model] : [])]);
  if (kind === "hermes") return run("hermes", [...modelArgs, "-z", promptText]);
  return run("claude", ["-p", promptText, ...modelArgs]);
}

function makeCtx(args, deps) {
  const flags = parseFlags(args);
  const io = deps.io || { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr };
  const home = deps.home || os.homedir();
  const configFile = deps.configFile || config.CONFIG_PATH;
  const env = deps.env || process.env;
  return {
    args,
    flags,
    io,
    home,
    configFile,
    repoRoot: deps.repoRoot || REPO_ROOT,
    projectDir: deps.projectDir || process.cwd(),
    platform: deps.platform || process.platform,
    locale: deps.locale || language.detectLocale(env),
    yes: Boolean(flags.yes),
    lang: null,
    t: translator("en"),
    config: deps.config || config.load(configFile),
    legacy: config.isLegacy(configFile),
    fs: deps.fs || fs,
    detect: deps.detect || (() => detectLib.detect(deps.detectOpts || {})),
    exec: deps.exec || ((cmd) => execFileSync(cmd, { shell: true, stdio: ["ignore", "pipe", "pipe"] })),
    listInstalled: deps.listInstalled || ((dir) => skillsLib.listInstalled(dir)),
    callVendor: deps.callVendor || realCallVendor,
    hasBmad: deps.hasBmad || (() => fs.existsSync(path.join(process.cwd(), "_bmad"))),
    packPlan: deps.packPlan || pack.plan,
    packInstall: deps.packInstall || pack.install,
    packRelink: deps.packRelink || pack.relink,
    sameTree: deps.sameTree || pack.sameTree,
    saveConfig: deps.saveConfig || config.save,
    completion: deps.completion || completion,
  };
}

async function execute(args, deps = {}) {
  const ctx = makeCtx(args, deps);
  let ui = deps.ui;
  try {
    if (!ui) ui = await createUI({ yes: ctx.yes, io: ctx.io, lang: ctx.locale });
    ctx.ui = ui;
    await ui.intro("hermad setup");

    if (ctx.flags.relinkOnly) {
      await relinkOnly(ctx, ui);
      return 0;
    }

    if (ctx.legacy) await ui.note(ctx.t("setup.existing", { l: ctx.config.language, m: ctx.config.permissions.mode === "bypass" ? "bypass" : "prompt" }));

    await language.collect(ctx, ui);
    await prereqs.collect(ctx, ui);
    ctx.personas = ctx.config.personas;
    if (!ctx.flags.skipAgents) await vendorsStep.collect(ctx, ui);
    await skillsStep.collect(ctx, ui);
    await permissionsStep.collect(ctx, ui);
    await bmadStep.collect(ctx, ui);
    await summaryStep.collect(ctx, ui);

    if (!ctx.apply) return 0;
    await apply(ctx, ui);
    await finish(ctx, ui);
    return 0;
  } catch (err) {
    return handleError(err, ctx);
  }
}

// `hermad setup --relink-only` (internal, lo usa update tras el binario nuevo):
// actualiza el pack y revisa enlaces, sin preguntar nada (FR-3.7).
async function relinkOnly(ctx, ui) {
  const vendors = ctx.detect().vendors.map((v) => v.kind);
  ctx.packInstall({ home: ctx.home, repoRoot: ctx.repoRoot });
  ctx.packRelink({ home: ctx.home, vendors, platform: ctx.platform, repoRoot: ctx.repoRoot });
  await ui.outro(ctx.t("update.relink"));
}

async function apply(ctx, ui) {
  const tr = ctx.t;
  const sp = ui.spinner();
  try {
    sp.start(tr("apply.pack"));
    const { packDir } = ctx.packInstall({ home: ctx.home, repoRoot: ctx.repoRoot });
    sp.stop(tr("apply.pack.done", { path: packDir }));
    sp.start(tr("apply.links"));
    const { actions } = ctx.packRelink({ home: ctx.home, vendors: ctx.vendors, platform: ctx.platform, repoRoot: ctx.repoRoot });
    sp.stop(tr("apply.links.done", { n: actions.filter((a) => a.action !== "ok" && a.action !== "skip-foreign").length }));
    sp.start(tr("apply.config"));
    ctx.saveConfig(ctx.desiredConfig, ctx.configFile);
    sp.stop(tr("apply.config.done"));
  } catch (err) {
    const action = ctx.lang === "es" ? "aplicar" : "apply";
    throw new SetupError([tr("err.apply.title", { action }), tr("err.apply.body", { path: err.path || "?", reason: err.message }), tr("err.apply.state.safe"), tr("err.apply.next")].join("\n"), 1);
  }
}

// Paso 9 — oferta de completion (default No; solo `--completion` la instala) y
// pantalla final con próximos pasos (ux §10).
async function finish(ctx, ui) {
  const tr = ctx.t;
  let shell = null;
  try {
    shell = ctx.completion.detectShell ? ctx.completion.detectShell() : null;
  } catch {
    shell = null;
  }
  let want = Boolean(ctx.flags.completion);
  if (shell && (want || ui.mode !== "headless")) {
    const plan = ctx.completion.plan(shell, { home: ctx.home });
    if (plan) {
      await ui.note(ctx.completion.formatPlan(plan), tr("completion.title"));
      if (!want) want = checkCancel(ui, await ui.confirm({ key: "completion", flag: "--completion", message: tr("completion.title"), defaultValue: false }));
    }
  }
  if (want && shell) {
    await ctx.completion.install(shell, { home: ctx.home, confirm: async () => true, log: () => {} });
    await ui.note(tr("completion.reload", { cmd: shell === "fish" ? "exec fish" : "exec $SHELL" }));
  }

  const lines = [tr("done.outro"), "", tr("done.next.title"), `  1. ${tr("done.next.1")}`, `  2. ${tr("done.next.2")}`, `  3. ${tr("done.next.3")}`];
  lines.push("", ctx.permissions.mode === "bypass" ? tr("done.perm.bypass", { date: (ctx.permissions.acceptedAt || "").slice(0, 10) }) : tr("done.perm.prompt"));
  if (ctx.bmad.autoInstall) lines.push(tr("done.bmad", { language: ctx.lang === "es" ? "español" : "English" }));
  if (ctx.herdrPending) lines.push(tr("done.herdr.pending", { cmd: ctx.herdrPending }));
  lines.push(tr("done.help"));
  await ui.outro(lines.join("\n"));
}

function handleError(err, ctx) {
  if (err instanceof NeedsInput || err.name === "NeedsInput") {
    ctx.io.stderr.write(ctx.t("err.needsinput", { key: err.key, flag: err.flag || "--?" }) + "\n");
    return NEEDS_INPUT_EXIT;
  }
  if (err instanceof CancelledError || err.name === "CancelledError") {
    ctx.io.stderr.write(ctx.t("setup.cancel") + "\n");
    return 130;
  }
  if (err instanceof SetupError || err.name === "SetupError") {
    ctx.io.stderr.write(err.message + "\n");
    return err.exitCode || 1;
  }
  ctx.io.stderr.write(`hermad: ${err.message}\n`);
  return 1;
}

// Borde CLI: `execute` devuelve el código; solo acá se llama process.exit.
function run(args) {
  return execute(args).then(
    (code) => {
      if (code) process.exit(code);
    },
    (err) => {
      console.error(`hermad: ${err.message}`);
      process.exit(1);
    }
  );
}

module.exports = { run, execute, parseFlags };
