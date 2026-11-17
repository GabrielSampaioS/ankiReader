const { test, expect } = require("@playwright/test");
const {
  pdfFile,
  importPdf,
  openFirstBook,
  collectErrors,
} = require("../helpers/e2e-helpers");

// Camada de texto: o texto invisível que permite selecionar palavras precisa
// ficar EXATAMENTE em cima do que se vê no canvas. Estes testes protegem
// contra o bug em que ela ocupava o palco inteiro e as palavras apareciam
// deslocadas (e com fonte de tamanho errado).

const PAGE_W = 612;
const PAGE_H = 792;
const LINE = { str: "Alinhamento correto", x: 150, y: 700, size: 24 };

async function openTextPdf(page, extra = {}) {
  await importPdf(
    page,
    pdfFile("texto.pdf", { pages: 2, text: [LINE], ...extra })
  );
  await openFirstBook(page);
  await page.waitForFunction(
    () => document.querySelectorAll("#text-layer span").length > 0
  );
}

/** Retângulos (em px de tela) do canvas, da camada de texto e da linha. */
function measure(page) {
  return page.evaluate(() => {
    const rect = (e) => {
      const r = e.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    const canvas = document.getElementById("page-canvas");
    const layer = document.getElementById("text-layer");
    const span = [...layer.querySelectorAll("span")].find((s) =>
      s.textContent.includes("Alinhamento")
    );
    return {
      canvas: rect(canvas),
      layer: rect(layer),
      span: span ? rect(span) : null,
      spanFontPx: span ? parseFloat(getComputedStyle(span).fontSize) : null,
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("a camada de texto cobre exatamente a página, não o palco inteiro", async ({ page }) => {
  await openTextPdf(page);
  const m = await measure(page);

  expect(m.layer.left).toBeCloseTo(m.canvas.left, 0);
  expect(m.layer.top).toBeCloseTo(m.canvas.top, 0);
  expect(Math.abs(m.layer.width - m.canvas.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(m.layer.height - m.canvas.height)).toBeLessThanOrEqual(1);
});

test("o texto fica na posição certa sobre a página", async ({ page }) => {
  await openTextPdf(page);
  const m = await measure(page);
  const scale = m.canvas.width / PAGE_W;

  expect(m.span).not.toBeNull();

  // Esquerda: x do PDF convertido para a tela.
  expect(m.span.left).toBeCloseTo(m.canvas.left + LINE.x * scale, -1);

  // A linha de base (y do PDF, invertido) fica dentro da caixa do texto.
  const baseline = m.canvas.top + (PAGE_H - LINE.y) * scale;
  expect(baseline).toBeGreaterThanOrEqual(m.span.top - 2);
  expect(baseline).toBeLessThanOrEqual(m.span.top + m.span.height + 2);

  // O texto nunca sai da área da página.
  expect(m.span.left).toBeGreaterThanOrEqual(m.canvas.left);
  expect(m.span.left + m.span.width).toBeLessThanOrEqual(m.canvas.left + m.canvas.width + 1);
});

test("o tamanho da fonte acompanha a escala da página", async ({ page }) => {
  await openTextPdf(page);
  const m = await measure(page);
  const scale = m.canvas.width / PAGE_W;

  expect(m.spanFontPx).toBeGreaterThan(LINE.size * scale * 0.85);
  expect(m.spanFontPx).toBeLessThan(LINE.size * scale * 1.15);
});

test("duplo clique seleciona a palavra sob o cursor, dentro da página", async ({ page }) => {
  const errors = collectErrors(page);
  await openTextPdf(page);
  const m = await measure(page);

  // 12px depois do início da linha cai dentro de "Alinhamento".
  await page.mouse.dblclick(m.span.left + 12, m.span.top + m.span.height / 2);

  const selected = await page.evaluate(() => window.getSelection().toString().trim());
  expect(selected).toBe("Alinhamento");

  // O destaque da seleção aparece sobre a página, não fora dela.
  const box = await page.evaluate(() => {
    const r = window.getSelection().getRangeAt(0).getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
  expect(box.left).toBeGreaterThanOrEqual(m.canvas.left);
  expect(box.right).toBeLessThanOrEqual(m.canvas.left + m.canvas.width);
  expect(box.top).toBeGreaterThanOrEqual(m.canvas.top);
  expect(box.bottom).toBeLessThanOrEqual(m.canvas.top + m.canvas.height);

  expect(errors).toEqual([]);
});

test("arrastar o mouse seleciona a linha inteira", async ({ page }) => {
  await openTextPdf(page);
  const m = await measure(page);
  const y = m.span.top + m.span.height / 2;

  await page.mouse.move(m.span.left + 1, y);
  await page.mouse.down();
  await page.mouse.move(m.span.left + m.span.width - 1, y, { steps: 8 });
  await page.mouse.up();

  const selected = await page.evaluate(() => window.getSelection().toString().trim());
  expect(selected).toBe("Alinhamento correto");
});

test("terminar uma seleção não troca de página", async ({ page }) => {
  await openTextPdf(page);
  const m = await measure(page);
  const y = m.span.top + m.span.height / 2;

  await page.mouse.move(m.span.left + 1, y);
  await page.mouse.down();
  await page.mouse.move(m.span.left + m.span.width - 1, y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  await expect(page.locator("#page-input")).toHaveValue("1");
});

test("ao girar a tela a camada de texto continua alinhada", async ({ page }) => {
  await openTextPdf(page);
  const before = await measure(page);

  await page.setViewportSize({ width: 800, height: 1280 });
  await expect
    .poll(async () => (await measure(page)).canvas.width)
    .not.toBeCloseTo(before.canvas.width, 0);

  const m = await measure(page);
  expect(m.layer.left).toBeCloseTo(m.canvas.left, 0);
  expect(Math.abs(m.layer.width - m.canvas.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(m.layer.height - m.canvas.height)).toBeLessThanOrEqual(1);

  const scale = m.canvas.width / PAGE_W;
  expect(m.span.left).toBeCloseTo(m.canvas.left + LINE.x * scale, -1);
});

test("trocar de página substitui o texto, sem acumular camadas antigas", async ({ page }) => {
  await openTextPdf(page);
  const countBefore = await page.locator("#text-layer span").count();

  await page.locator("#next-button").click();
  await expect(page.locator("#page-input")).toHaveValue("2");
  await page.waitForFunction(
    () => document.querySelectorAll("#text-layer span").length > 0
  );
  await page.waitForTimeout(200);

  expect(await page.locator("#text-layer span").count()).toBe(countBefore);
});

test("fechar o livro limpa a camada de texto", async ({ page }) => {
  await openTextPdf(page);
  await page.locator("#back-button").click();

  await expect(page.locator("#text-layer span")).toHaveCount(0);
});
