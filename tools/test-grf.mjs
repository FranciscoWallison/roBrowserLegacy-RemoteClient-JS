import { GrfNode } from "@chicowall/grf-loader";
import { openSync, closeSync } from "fs";

const grfPath = process.argv[2];
const encoding = process.argv[3] || "auto";

if (!grfPath) {
  console.error(
    "Uso: node tools/test-grf.mjs <caminho-do-grf> [auto|euc-kr|cp949|utf-8]"
  );
  process.exit(1);
}

const fd = openSync(grfPath, "r");

try {
  const grf = new GrfNode(fd, { filenameEncoding: encoding });

  console.log("[1] load()...");
  await grf.load();

  const bad = Array.from(grf.files.keys()).filter((k) => k.includes("\uFFFD"));
  console.log("Bad names sample:", bad.slice(0, 20));

  console.log("[2] stats:");
  const stats = grf.getStats?.() ?? {};
  console.log(stats);

  // Confirma contagem
  console.log(
    `[3] fileCount=${stats.fileCount} badNameCount=${stats.badNameCount} collisionCount=${stats.collisionCount}`
  );
  console.log(`[4] detectedEncoding=${stats.detectedEncoding}`);

  // Extensão
  if (grf.getFilesByExtension) {
    const spr = grf.getFilesByExtension("spr");
    console.log(`[5] .spr = ${spr.length}`);
  }

  // Busca
  if (grf.find) {
    const r = grf.find({ ext: "act", contains: "data/sprite", limit: 10 });
    console.log(`[6] find() hits = ${r.length}`);
    console.log(r.slice(0, 5));
  }

  // hasFile + getFile (testa slash/case)
  const q1 = "data/sprite/로브/c_j_umbrella/남/타조크라운_남.spr";
  const q2 = "DATA\\SPRITE\\로브\\C_J_UMBRELLA\\남\\타조크라운_남.SPR";

  if (grf.hasFile) {
    console.log(`[7] hasFile("${q1}") =`, grf.hasFile(q1));
  }

  if (grf.resolvePath) {
    const resolved = grf.resolvePath(q2);
    console.log(`[8] resolvePath("${q2}") =`, resolved);

    if (resolved?.status === "ambiguous") {
      console.log("Ambíguo. Candidatos:", resolved.candidates?.slice(0, 20));
    }
  }

  // Tenta extrair 1 arquivo garantido: o primeiro da lista
  const firstKey = grf.files ? Array.from(grf.files.keys())[0] : null;
  if (firstKey) {
    const { data, error } = await grf.getFile(firstKey);
    console.log(
      `[9] extract first: ${firstKey} ->`,
      error ? `ERRO: ${error}` : `${data.length} bytes`
    );
  }

  console.log("OK ✅");
} finally {
  closeSync(fd);
}
