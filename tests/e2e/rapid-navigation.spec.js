const { test, expect } = require("@playwright/test");
const {
  pdfFile,
  importPdf,
  openFirstBook,
  expectRenderedPage,
  readStoredBooks,
  collectErrors,
} = require("../helpers/e2e-helpers");

// Protege contra o erro do PDF.js "Cannot use the same canvas during multiple
// render() operations": acontece se uma renderização nova começa antes de a
// anterior ser cancelada. Os cliques do Playwright são lentos demais para
// provocar isso, então os eventos são disparados todos de uma vez.

test("30 trocas de página disparadas de uma vez não geram erro e terminam na página certa", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await importPdf(page, pdfFile("rapido.pdf", { pages: 6 }));
  await openFirstBook(page);

  // Sequência: 4× →, 3× ←, repetida. Saldo líquido calculado abaixo.
  const final = await page.evaluate(() => {
    let page = 1;
    for (let i = 0; i < 30; i++) {
      const right = i % 7 < 4;
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: right ? "ArrowRight" : "ArrowLeft" })
      );
      page = Math.min(6, Math.max(1, page + (right ? 1 : -1)));
    }
    return page;
  });

  await expectRenderedPage(expect, page, final);
  await expect(page.locator("#page-input")).toHaveValue(String(final));
  await expect
    .poll(async () => (await readStoredBooks(page))[0].currentPage)
    .toBe(final);
  expect(errors).toEqual([]);
});
