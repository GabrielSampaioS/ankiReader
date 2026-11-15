const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "..");
const PDFJS_BUILD = path.join(ROOT, "node_modules", "pdfjs-dist", "build");

if (!fs.existsSync(PDFJS_BUILD)) {
  console.warn(
    "[aviso] pdfjs-dist não encontrado. Rode: npm install pdfjs-dist"
  );
}

app.use(express.static(path.join(ROOT, "public")));
app.use("/src", express.static(path.join(ROOT, "src")));


// Disponibiliza o PDF.js e o Worker localmente.
app.use("/vendor/pdfjs", express.static(PDFJS_BUILD));

// Disponibiliza os arquivos CSS do PDF.js.
app.use(
  "/vendor/pdfjs/web",
  express.static(path.join(ROOT, "vendor", "pdfjs", "web"))
);
// Disponibiliza o PDF.js e o Worker localmente (necessário para uso offline).
app.use("/vendor/pdfjs", express.static(PDFJS_BUILD));

app.listen(PORT, () => {
  console.log(`Anki Reader rodando em http://localhost:${PORT}`);
});
