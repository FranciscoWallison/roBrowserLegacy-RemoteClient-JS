const fs = require("fs");

const path = require("path");

// Copiar a função parseIni do clientController

function parseIni(data) {
  const regex = {
    section: /^\s*\[\s*([^\]]*)\s*\]\s*$/,

    param: /^\s*([\w\.\-\_]+)\s*=\s*(.*?)\s*$/,

    comment: /^\s*;.*$/,
  };

  const value = {};

  const lines = data.split(/[\r\n]+/);

  let section = null;

  lines.forEach((line) => {
    if (regex.comment.test(line)) {
      return;
    } else if (regex.param.test(line)) {
      const match = line.match(regex.param);

      const key = parseInt(match[1], 10);

      const val = match[2];

      if (section) {
        if (!value[section]) {
          value[section] = [];
        }

        value[section][key] = val;
      } else {
        if (!value[key]) {
          value[key] = [];
        }

        value[key] = val;
      }
    } else if (regex.section.test(line)) {
      const match = line.match(regex.section);

      section = match[1];

      // Normalizar seção "Data" para lowercase

      if (section.toLowerCase() === "data") {
        section = "data";
      }

      if (!value[section]) {
        value[section] = [];
      }
    }
  });

  return value;
}

// Testar com diferentes variações de case

const testCases = [
  { name: "Uppercase", content: "[Data]\n0=test.grf" },

  { name: "Lowercase", content: "[data]\n0=test.grf" },

  { name: "Mixed case", content: "[DaTa]\n0=test.grf" },

  { name: "All caps", content: "[DATA]\n0=test.grf" },
];

console.log("Testando normalização de seção Data:\n");

testCases.forEach((test) => {
  const result = parseIni(test.content);

  const hasDataSection = "data" in result;

  const status = hasDataSection ? "✓" : "✗";

  console.log(`${status} ${test.name}: ${test.content.split("\n")[0]}`);

  console.log(`  Seções encontradas:`, Object.keys(result));

  console.log(`  Valor: ${hasDataSection ? result.data[0] : "N/A"}\n`);
});

console.log('Todos os testes devem mostrar a seção normalizada como "data"');
