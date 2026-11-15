const { test, expect } = require("@playwright/test");

// Garante que o servidor entrega o que o navegador precisa para funcionar,
// inclusive offline-friendly: PDF.js e Worker servidos localmente.

const JS_MIME = /(text|application)\/javascript/;

test("a página inicial é servida", async ({ request }) => {
  const res = await request.get("/");
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("Anki Reader");
});

test("app.js é servido como JavaScript", async ({ request }) => {
  const res = await request.get("/app.js");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(JS_MIME);
});

for (const file of [
  "/src/storage/book-storage.js",
  "/src/reader/pdf-viewer.js",
  "/src/reader/reader-math.mjs",
]) {
  test(`módulo ${file} é servido como JavaScript`, async ({ request }) => {
    const res = await request.get(file);
    expect(res.status()).toBe(200);
    // Módulos ES só carregam no navegador com um MIME de JavaScript.
    expect(res.headers()["content-type"]).toMatch(JS_MIME);
  });
}

for (const file of ["/vendor/pdfjs/pdf.mjs", "/vendor/pdfjs/pdf.worker.mjs"]) {
  test(`${file} (PDF.js local) é servido como JavaScript`, async ({ request }) => {
    const res = await request.get(file);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(JS_MIME);
  });
}

test("o servidor não expõe arquivos fora das pastas públicas", async ({ request }) => {
  for (const path of ["/server/server.js", "/package.json", "/playwright.config.js"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
  }
});

test("a aplicação carrega sem erros no console", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/");
  await expect(page.locator("#library-view")).toBeVisible();

  expect(errors).toEqual([]);
});
