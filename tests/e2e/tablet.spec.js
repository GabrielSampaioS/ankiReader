const { test, expect } = require("@playwright/test");
const {
  pdfFile,
  importPdf,
  openFirstBook,
  expectRenderedPage,
  readStoredBooks,
} = require("../helpers/e2e-helpers");

// Roda no projeto "tablet" (emulação de Galaxy Tab: toque, tela, densidade).
// É uma emulação no Chromium: não substitui um teste no aparelho real.

async function stagePoint(page, xRatio) {
  const box = await page.locator("#stage").boundingBox();
  return { x: box.x + box.width * xRatio, y: box.y + box.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await importPdf(page, pdfFile("tablet.pdf", { pages: 4 }));
  await openFirstBook(page);
});

test("o dispositivo emulado tem toque", async ({ page }) => {
  expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
});

test("tocar nas extremidades troca de página", async ({ page }) => {
  let p = await stagePoint(page, 0.93);
  await page.touchscreen.tap(p.x, p.y);
  await expectRenderedPage(expect, page, 2);

  p = await stagePoint(page, 0.93);
  await page.touchscreen.tap(p.x, p.y);
  await expectRenderedPage(expect, page, 3);

  p = await stagePoint(page, 0.07);
  await page.touchscreen.tap(p.x, p.y);
  await expectRenderedPage(expect, page, 2);

  await expect.poll(async () => (await readStoredBooks(page))[0].currentPage).toBe(2);
});

test("tocar no centro não troca de página", async ({ page }) => {
  const p = await stagePoint(page, 0.5);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(150);

  await expectRenderedPage(expect, page, 1);
});

test("a página cabe na tela do tablet, sem rolagem vertical", async ({ page }) => {
  const m = await page.evaluate(() => {
    const stage = document.getElementById("stage").getBoundingClientRect();
    const canvas = document.getElementById("page-canvas").getBoundingClientRect();
    return {
      stageW: stage.width,
      stageH: stage.height,
      canvasW: canvas.width,
      canvasH: canvas.height,
      scrollH: document.documentElement.scrollHeight,
      clientH: document.documentElement.clientHeight,
    };
  });

  expect(m.canvasW).toBeLessThanOrEqual(m.stageW + 1);
  expect(m.canvasH).toBeLessThanOrEqual(m.stageH + 1);
  expect(m.scrollH).toBeLessThanOrEqual(m.clientH);
});

test("o zoom por pinça está desativado no viewport", async ({ page }) => {
  const content = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(content).toContain("user-scalable=no");
});

test("girar o tablet para retrato reajusta a página", async ({ page }) => {
  const before = await page.evaluate(
    () => document.getElementById("page-canvas").getBoundingClientRect().width
  );

  const { width, height } = page.viewportSize();
  await page.setViewportSize({ width: height, height: width });

  await expect
    .poll(() =>
      page.evaluate(() => document.getElementById("page-canvas").getBoundingClientRect().width)
    )
    .not.toBeCloseTo(before, 0);

  const m = await page.evaluate(() => {
    const stage = document.getElementById("stage").getBoundingClientRect();
    const canvas = document.getElementById("page-canvas").getBoundingClientRect();
    return { stageW: stage.width, stageH: stage.height, w: canvas.width, h: canvas.height };
  });
  expect(m.w).toBeLessThanOrEqual(m.stageW + 1);
  expect(m.h).toBeLessThanOrEqual(m.stageH + 1);
  await expectRenderedPage(expect, page, 1);
});
