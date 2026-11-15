const { makePdf, PAGE_COLORS_RGB } = require("./make-pdf");

/** Arquivo pronto para page.setInputFiles(). */
function pdfFile(name = "livro.pdf", options) {
  return {
    name,
    mimeType: "application/pdf",
    buffer: makePdf(options),
  };
}

/** Importa um PDF pela interface e espera ele aparecer na biblioteca. */
async function importPdf(page, file) {
  await page.locator("#file-input").setInputFiles(file);
  await page
    .locator("#book-list .book-name", { hasText: file.name })
    .first()
    .waitFor();
}

/** Abre o primeiro livro da biblioteca e espera a primeira renderização. */
async function openFirstBook(page) {
  await page.locator("#book-list li button").first().click();
  await page.locator("#reader").waitFor({ state: "visible" });
  await waitForRender(page);
}

/** Espera o canvas ter sido desenhado (dimensões > 0). */
async function waitForRender(page) {
  await page.waitForFunction(() => {
    const c = document.getElementById("page-canvas");
    return c && c.width > 0 && c.height > 0;
  });
}

/** Cor (RGB) do pixel central do canvas. */
function centerPixel(page) {
  return page.evaluate(() => {
    const c = document.getElementById("page-canvas");
    const ctx = c.getContext("2d");
    const { data } = ctx.getImageData(
      Math.floor(c.width / 2),
      Math.floor(c.height / 2),
      1,
      1
    );
    return [data[0], data[1], data[2]];
  });
}

/**
 * Espera a página N (1-based) estar desenhada, identificando-a pela cor.
 * Usa polling porque a renderização é assíncrona.
 */
async function expectRenderedPage(expect, page, n) {
  await expect
    .poll(() => centerPixel(page), {
      message: `esperava a página ${n} renderizada`,
      timeout: 10_000,
    })
    .toEqual(PAGE_COLORS_RGB[n - 1]);
}

/** Lê o registro de um livro diretamente do IndexedDB (fora da UI). */
function readStoredBooks(page) {
  return page.evaluate(async () => {
    const { getAllBooks } = await import("/src/storage/book-storage.js");
    const books = await getAllBooks();
    return books.map((b) => ({
      id: b.id,
      name: b.name,
      currentPage: b.currentPage,
      cover: b.cover,
      isBlob: b.file instanceof Blob,
      size: b.file.size,
    }));
  });
}

/** Falha o teste se a página emitir erro de JavaScript ou console.error. */
function collectErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/** Gerar capa para teste **/
const cover = new Blob(["imagem de teste"], {
  type: "image/png",
});



module.exports = {
  pdfFile,
  cover,
  importPdf,
  openFirstBook,
  waitForRender,
  centerPixel,
  expectRenderedPage,
  readStoredBooks,
  collectErrors,
};
