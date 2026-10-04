"use strict";
// Copy del wizard (docs/hermad-para-todos-ux.md). Claves planas; {x} = interpolación.
// Paridad de claves con en.js la verifica test/i18n.test.js: agregar una clave acá
// sin su par en en.js rompe la suite.
module.exports = {
  // Paso 1 — Idioma
  "language.title": "Idioma",
  "language.note":
    "Este idioma se usará en este asistente, para que tus agentes se comuniquen contigo y para los documentos de BMad. Los prompts internos de las personas siguen en inglés.",

  // Paso 2 — Prerequisitos
  "prereqs.title": "Revisando tu entorno…",
  "prereqs.node.ok": "Node {v} (necesitas ≥ 20.12)",
  "prereqs.herdr.ok": "herdr {v}",
  "prereqs.vendors.ok": "Vendors detectados: {list}",
  "prereqs.vendors.exp": "{n} (experimental: no probado en vivo)",
  "prereqs.herdr.missing.title": "No encontré herdr",
  "prereqs.herdr.missing.body":
    "herdr es el panel donde viven tus agentes. Sin él, hermad no puede abrir el equipo (start-team). Puedes seguir con el setup e instalarlo después.",
  "prereqs.herdr.cmd": "Comando para tu sistema:",
  "prereqs.herdr.ask": "¿Lo instalo ahora ejecutando ese comando?",
  "prereqs.herdr.yes": "Sí, instalar",
  "prereqs.herdr.no": "No, lo haré yo",
  "prereqs.herdr.error":
    "Error: la instalación de herdr falló (código {n}). Salida guardada en {log}. Instálalo a mano y vuelve a correr hermad setup.",
  "prereqs.herdr.skip": "Sigo sin herdr. Antes de start-team ejecuta: {cmd}",

  // Paso 3 — Vendors y modelo
  "vendors.single":
    "Solo encontré {vendor}, así que todas las personas lo usarán. (Una persona es un rol de tu equipo: orquestador, dev, reviewer…)",
  "vendors.split.title": "Reparto propuesto",
  "vendors.split.ask": "¿Usamos este reparto?",
  "vendors.split.yes": "Sí, usarlo",
  "vendors.split.edit": "Quiero cambiarlo",
  "vendors.split.edit.persona": "Vendor para {persona}",
  "model.ask": "Modelo para {vendor}",
  "model.other": "Otro (escribirlo)…",
  "model.default": "Dejar el modelo por defecto de {vendor}",
  "model.same": "¿Usar el mismo modelo en todas las personas de {vendor}?",
  "model.same.no": "No, elegir por persona",
  "model.note": "hermad no elige modelos por ti: lo que elijas aquí es lo que se usará.",
  "model.fetching": "Consultando modelos de {vendor}…",
  "model.listfail": "Aviso: no pude listar modelos de {vendor}; escribe uno o deja el default.",
  "model.hermes": "Flag de modelo para hermes (puede quedar vacío)",

  // Paso 4 — Skills
  "skills.intro":
    "Puedo buscar las skills que ya tienes instaladas y proponerte cuáles activar para tu equipo. No instalo ni descargo nada.",
  "skills.go": "Buscar y proponer",
  "skills.skip": "Saltar este paso",
  "skills.scanning": "Indexando skills instaladas…",
  "skills.none": "No encontré skills instaladas. Seguimos sin ellas; tu equipo funciona igual.",
  "skills.consent.title": "Antes de seguir: ¿enviar descripciones a un modelo?",
  "skills.consent.body": "Para recomendarte mejor puedo pedirle a {vendor} ({model}) que lea el nombre y la descripción de tus skills y el nombre y el rol en una línea de cada persona.",
  "skills.consent.sent": "Se enviaría: el nombre y la descripción corta de cada skill, más el nombre y el rol en una línea de cada persona ({n} skills)",
  "skills.consent.notsent": "NO se enviaría: el contenido de las skills, tus archivos ni tus proyectos",
  "skills.consent.dest": "Destino: {vendor}, con el modelo {model} que elegiste en el paso anterior",
  "skills.consent.local":
    "Si dices que no, uso un buscador local: la recomendación es menos fina, pero no sale nada de tu equipo.",
  "skills.consent.ask": "¿Enviar nombres y descripciones a {vendor}?",
  "skills.consent.yes": "Sí, enviar",
  "skills.consent.no": "No, usar el buscador local",
  "skills.consent.unavailable": "Con {vendor} no hago recomendaciones remotas; uso el buscador local.",
  "skills.global.title": "Skills para todo el equipo (espacio = marcar, enter = confirmar)",
  "skills.persona.title": "Skills solo para {persona}",
  "skills.source.llm": "Sugeridas por {vendor}",
  "skills.source.local": "Sugeridas por el buscador local",
  "skills.hint.skip": "Enter sin marcar nada = ninguna",
  "skills.showing": "Mostrando 15 de {n}. Puedes ajustar después con hermad skills global add/rm.",
  "skills.nonative": "(no nativa: se cargará por ruta)",

  // Paso 5 — Permisos
  "perm.title": "Permisos de los agentes — decisión importante",
  "perm.intro": "Tus agentes pueden trabajar de dos maneras:",
  "perm.prompt.head": "A) Modo con permisos (recomendado)",
  "perm.prompt.body":
    "Cada vez que un agente quiera ejecutar un comando o editar un archivo, se detiene y te pregunta. Es lo más seguro.",
  "perm.prompt.cost":
    'Costo: el equipo se frena. Un agente en espera aparece como "blocked" y no avanza hasta que lo atiendas en su panel. Con varios agentes trabajando, tendrás que ir mirando los paneles.',
  "perm.bypass.head": "B) Modo sin permisos (bypass)",
  "perm.bypass.body":
    "Los agentes ejecutan comandos y modifican archivos SIN preguntarte. Es rápido y no se detiene, pero un agente que se equivoque, o que siga instrucciones maliciosas escondidas en un archivo o página que lea, puede borrar o cambiar archivos, o ejecutar comandos en tu máquina, y no te enterarás hasta después. Con este modo hermad no te protege. Úsalo solo en una máquina o carpeta donde puedas perder el trabajo.",
  "perm.change": "Puedes cambiarlo cuando quieras con: hermad settings permissions",
  "perm.ask": "¿Qué modo quieres?",
  "perm.opt.prompt": "Con permisos — los agentes me preguntan (recomendado)",
  "perm.opt.bypass": "Sin permisos (bypass) — los agentes no preguntan",
  "perm.confirm.title": "Confirma que entiendes el riesgo",
  "perm.confirm.body":
    "Elegiste el modo SIN permisos. Los agentes podrán ejecutar comandos y modificar archivos de tu computadora sin preguntarte.",
  "perm.confirm.ask": "¿Aceptas ese riesgo?",
  "perm.confirm.yes": "Sí, lo acepto",
  "perm.confirm.no": "No, prefiero el modo con permisos",
  "perm.kept": "Quedas en modo con permisos. Puedes cambiarlo luego con hermad settings permissions.",

  // Paso 6 — BMad
  "bmad.title": "BMad (opcional)",
  "bmad.body":
    "BMad es un método con skills y plantillas que enriquece a tus agentes. Tu equipo funciona sin él. Si quieres, lo instalo en cada proyecto nuevo que crees con hermad create-project (en {language}).",
  "bmad.yes": "Sí, instalarlo en proyectos nuevos",
  "bmad.no": "No, por ahora",
  "bmad.later": "Puedes instalarlo cuando quieras con create-project --run-bmad-install.",
  "bmad.detected": "Detecté BMad en esta carpeta; lo uso.",

  // Paso 7 — Resumen
  "summary.title": "Esto es lo que voy a hacer",
  "summary.config": "Configuración",
  "summary.files": "Archivos que crearé o actualizaré",
  "summary.untouched": "No tocaré: {list}",
  "summary.link": "(enlace)",
  "summary.copy": "(copia)",
  "summary.relink.replace": "reemplaza un enlace antiguo que apuntaba a {path}",
  "summary.skipped.foreign": "Dejo intacto {path}: ya existe y no es de hermad",
  "summary.ask": "¿Aplico estos cambios?",
  "summary.yes": "Sí, aplicar",
  "summary.no": "No, salir sin cambios",
  "summary.nochange": "Nada que cambiar: tu instalación ya está al día.",

  // Paso 8 — Aplicar
  "apply.pack": "Copiando el pack base…",
  "apply.pack.done": "Pack base copiado a {path}",
  "apply.links": "Creando enlaces…",
  "apply.links.done": "Enlaces creados ({n})",
  "apply.config": "Guardando configuración…",
  "apply.config.done": "Configuración guardada",
  "apply.nochange": "Sin cambios",

  // Paso 9 — Completion + próximos pasos
  "completion.title": "Completar comandos con TAB",
  "completion.body": "Puedo activar el autocompletado de hermad en tu shell ({shell}). Haría esto:",
  "completion.create": "crear {path}",
  "completion.block": "añadir un bloque marcado (# >>> hermad >>>) a {path}",
  "completion.undo": "Se puede deshacer con: hermad completion uninstall",
  "completion.yes": "Sí, activarlo",
  "completion.no": "No, gracias",
  "completion.reload": "Abre una terminal nueva (o ejecuta: {cmd}) para que funcione.",
  "completion.ps.restricted":
    "PowerShell tiene ExecutionPolicy Restricted: no toqué tu perfil. Cuando lo cambies, ejecuta hermad completion install.",
  "completion.noshell": "No reconocí tu shell. Usa: hermad completion <zsh|bash|fish|powershell>",
  "done.outro": "Listo. Tu hermad está configurado.",
  "done.next.title": "Próximos pasos",
  "done.next.1": "Crea un proyecto: hermad create-project mi-app",
  "done.next.2": "Abre tu equipo: cd mi-app && hermad start-team",
  "done.next.3": "Pídele algo al equipo: /hermad <lo que necesitas>",
  "done.perm.prompt":
    'Permisos: con permisos (los agentes te preguntarán; mira los paneles "blocked"). Cámbialo con: hermad settings permissions',
  "done.perm.bypass": "Permisos: SIN permisos (bypass), aceptado el {date}. Cámbialo con: hermad settings permissions prompt",
  "done.herdr.pending": "Antes de start-team instala herdr: {cmd}",
  "done.help": "Más ayuda: hermad --help",
  "done.bmad": "Los proyectos nuevos instalarán BMad en {language}.",

  // update
  "update.method": "Instalación detectada: {method}",
  "update.current": "Versión actual: {v}",
  "update.available": "Versión disponible: {v}",
  "update.uptodate": "Ya tienes la última versión ({v}). Reviso el pack por si faltan enlaces…",
  "update.ask": "¿Actualizar ahora?",
  "update.yes": "Sí, actualizar",
  "update.no": "No",
  "update.git.will": "Voy a ejecutar: git pull --ff-only y npm install --omit=dev en {path}.",
  "update.npm.will": "Voy a ejecutar: npm install -g {repo}",
  "update.relink": "Pack base actualizado y enlaces revisados",
  "update.done": "Listo. Todo está al día.",
  "update.warn.version": "Aviso: no pude ver la versión disponible. ¿Actualizo igual?",
  "update.unknown.title": "No pude determinar cómo instalaste hermad.",
  "update.unknown.body": "Actualiza a mano con uno de estos dos comandos:",
  "update.unknown.next": "Después ejecuta: hermad setup --relink-only",
  "update.error.noGit":
    "Error: npm necesita git para instalar desde GitHub y no lo encuentro. Instala git y repite hermad update.",
  "update.error.pull":
    "Error: git pull --ff-only falló (tienes cambios o ramas divergentes). No modifiqué nada. Resuélvelo en {path} y repite hermad update.",
  "update.nochange": "Sin cambios.",
  "update.interrupted": "Actualización interrumpida. Verifica con hermad --version y repite hermad update si hace falta.",

  // settings permissions
  "settings.perm.warn":
    "Los agentes ya abiertos conservan el modo anterior. Cierra y vuelve a abrir el equipo (start-team) para aplicar el cambio.",
  "settings.perm.project": "Aplicado solo a este proyecto.",

  // errores y setup
  "err.novendor.title": "No encontré ningún vendor de IA instalado",
  "err.novendor.body": "hermad necesita al menos uno para correr tus agentes. Busqué: {list}.",
  "err.novendor.next": "Instala uno y repite: hermad setup",
  "err.node":
    "Error: hermad necesita Node 20.12 o superior (tienes {v}).\n       Actualiza Node (https://nodejs.org) y repite: hermad setup",
  "err.apply.title": "Error al {action}",
  "err.apply.body": "No pude escribir {path}: {reason}.",
  "err.apply.state.safe": "Estado: el pack anterior y tu configuración siguen intactos.",
  "err.apply.state.partial": "Estado: el pack nuevo está copiado, pero la configuración no se guardó.",
  "err.apply.next":
    "Siguiente: corrige el permiso de esa carpeta y repite hermad setup (es seguro repetirlo: no duplica nada).",
  "err.needsinput":
    "Error: falta información para continuar sin terminal: {key}. Pásala con {flag} o corre hermad setup en una terminal interactiva.",
  "setup.cancel": "Setup cancelado. No modifiqué nada. Puedes retomarlo con hermad setup.",
  "setup.cancel.apply":
    "Setup interrumpido durante la aplicación. Tu pack y configuración anteriores siguen intactos; repite hermad setup para terminar.",
  "setup.cancel.completion":
    "Setup terminado. No activé el autocompletado; puedes hacerlo con hermad completion install.",
  "setup.existing":
    "Ya tienes una configuración (idioma: {l}, permisos: {m}). Los pasos arrancan con tus valores actuales; enter los conserva.",
  "setup.nochange": "Nada que cambiar",

  // adaptador de UI
  "wizard.clack.fallback":
    "Aviso: no pude cargar la interfaz moderna (falta npm install). Sigo en modo simple.",
};
