"use strict";

const HELP = `hermad — instalador y gobernador de Hermad (Herdr x BMad)

Uso:
  hermad setup                          instala skill/comando + elige CLI/modelo por agente
  hermad create-project "nombre"        scaffolding agentico completo para un proyecto nuevo
  hermad settings agents [persona]      re-define CLI/modelo por agente (todas o una)
  hermad start-team                     abre workspace+tabs+agentes conectados, sin prompt inicial
  hermad orchestrate "intent"           igual que start-team pero le manda el intent al orquestador
  hermad update                         git pull del repo instalado (updates desde GitHub)
  hermad --version                      versión instalada
  hermad --help                         esta ayuda
`;

async function main(argv) {
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(HELP);
    return;
  }
  if (cmd === "--version" || cmd === "-v") {
    console.log(require("../package.json").version);
    return;
  }

  try {
    switch (cmd) {
      case "setup":
        await require("./commands/setup").run(rest);
        break;
      case "create-project":
        require("./commands/create-project").run(rest);
        break;
      case "settings":
        await require("./commands/settings-agents").run(rest);
        break;
      case "start-team":
        require("./commands/start-team").run();
        break;
      case "orchestrate":
        require("./commands/orchestrate").run(rest);
        break;
      case "update":
        require("./commands/update").run();
        break;
      default:
        console.error(`comando desconocido: ${cmd}\n`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (err) {
    console.error(`hermad: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { main };
