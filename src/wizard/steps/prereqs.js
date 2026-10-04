"use strict";
// Paso 2 — Prerequisitos (ux §3). Node ≥ 20.12, herdr y vendors. Puro salvo la
// instalación de herdr, que solo corre con confirmación explícita (default No).
// Node viejo o cero vendors abortan (exit 1); herdr ausente NO bloquea.
const { t } = require("../../lib/i18n");
const { checkCancel, SetupError } = require("../../lib/prompt");
const vendors = require("../../lib/vendors");

function vendorLabel(kind, tr) {
  return vendors.isExperimental(kind) ? tr("prereqs.vendors.exp", { n: kind }) : kind;
}

function statusLines(d, tr) {
  const lines = [`✔ ${tr("prereqs.node.ok", { v: d.node.version })}`];
  if (d.herdr.present) lines.push(`✔ ${tr("prereqs.herdr.ok", { v: d.herdr.version || "" })}`);
  lines.push(`✔ ${tr("prereqs.vendors.ok", { list: d.vendors.map((v) => vendorLabel(v.kind, tr)).join(", ") })}`);
  return lines;
}

async function collect(ctx, ui) {
  const tr = ctx.t;
  const d = ctx.detect();
  ctx.detection = d;

  if (!d.node.ok) {
    // Único mensaje bilingüe (ux §12.1): el idioma todavía no importa.
    throw new SetupError(`${t("es", "err.node", { v: d.node.version })}\n${t("en", "err.node", { v: d.node.version })}`, 1);
  }

  ctx.vendors = d.vendors.map((v) => v.kind);
  if (!ctx.vendors.length) {
    throw new SetupError(
      [tr("err.novendor.title"), tr("err.novendor.body", { list: Object.keys(vendors.VENDOR_BINARIES).join(", ") }), tr("err.novendor.next")].join("\n"),
      1
    );
  }

  await ui.note(statusLines(d, tr).join("\n"), tr("prereqs.title"));

  if (!d.herdr.present) {
    await ui.note([tr("prereqs.herdr.missing.body"), "", `${tr("prereqs.herdr.cmd")} ${d.herdr.install}`].join("\n"), tr("prereqs.herdr.missing.title"));
    const install = checkCancel(ui, await ui.confirm({ key: "herdr", message: tr("prereqs.herdr.ask"), defaultValue: false }));
    if (install) {
      try {
        ctx.exec(d.herdr.install);
        ctx.herdrInstalled = true;
      } catch (err) {
        ctx.herdrPending = d.herdr.install;
        await ui.note(tr("prereqs.herdr.error", { n: err.status || 1, log: "(salida del comando)" }));
      }
    } else {
      ctx.herdrPending = d.herdr.install;
      await ui.note(tr("prereqs.herdr.skip", { cmd: d.herdr.install }));
    }
  }
}

module.exports = { collect, statusLines, vendorLabel };
