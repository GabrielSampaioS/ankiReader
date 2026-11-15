const { test, expect } = require("@playwright/test");
const {
  pdfFile,
  importPdf,
  openFirstBook,
  expectRenderedPage,
  readStoredBooks,
  collectErrors,
} = require("../helpers/e2e-helpers");

async function openBookWithPages(page, pages) {
  await importPdf(page, pdfFile("livro.pdf", { pages }));
  await openFirstBook(page);
}

async function storedPage(page) {
  return (await readStoredBooks(page))[0].currentPage;
}

/** Posição (x, y) na tela correspondente a uma fração da largura do stage. */
async function stagePoint(page, xRatio) {
  const box = await page.locator("#stage").boundingBox();
  return { x: box.x + box.width * xRatio, y: box.y + box.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test.describe("navegação entre páginas", () => {
  test("botão › avança e ‹ volta, renderizando a página certa", async ({ page }) => {
    const errors = collectErrors(page);
    await openBookWithPages(page, 3);

    await page.locator("#next-button").click();
    await expectRenderedPage(expect, page, 2);
    await expect(page.locator("#page-input")).toHaveValue("2");

    await page.locator("#next-button").click();
    await expectRenderedPage(expect, page, 3);

    await page.locator("#prev-button").click();
    await expectRenderedPage(expect, page, 2);

    expect(errors).toEqual([]);
  });

  test("‹ fica desabilitado na primeira página e › na última", async ({ page }) => {
    await openBookWithPages(page, 2);

    await expect(page.locator("#prev-button")).toBeDisabled();
    await expect(page.locator("#next-button")).toBeEnabled();

    await page.locator("#next-button").click();
    await expectRenderedPage(expect, page, 2);

    await expect(page.locator("#next-button")).toBeDisabled();
    await expect(page.locator("#prev-button")).toBeEnabled();
  });

  test("campo numérico salta para a página digitada", async ({ page }) => {
    await openBookWithPages(page, 5);

    await page.locator("#page-input").fill("4");
    await page.locator("#page-input").press("Enter");
    await page.locator("#page-input").blur();

    await expectRenderedPage(expect, page, 4);
    expect(await storedPage(page)).toBe(4);
  });

  test("página fora do intervalo é limitada ao início/fim", async ({ page }) => {
    await openBookWithPages(page, 5);

    await page.locator("#page-input").fill("999");
    await page.locator("#page-input").blur();
    await expectRenderedPage(expect, page, 5);
    await expect(page.locator("#page-input")).toHaveValue("5");

    await page.locator("#page-input").fill("0");
    await page.locator("#page-input").blur();
    await expectRenderedPage(expect, page, 1);
    await expect(page.locator("#page-input")).toHaveValue("1");
  });

  test("setas do teclado navegam; nas extremidades não passam do limite", async ({ page }) => {
    await openBookWithPages(page, 3);

    await page.keyboard.press("ArrowLeft"); // já está na 1
    await expectRenderedPage(expect, page, 1);

    await page.keyboard.press("ArrowRight");
    await expectRenderedPage(expect, page, 2);
    await page.keyboard.press("PageDown");
    await expectRenderedPage(expect, page, 3);
    await page.keyboard.press("ArrowRight"); // já está na última
    await expectRenderedPage(expect, page, 3);
    await page.keyboard.press("PageUp");
    await expectRenderedPage(expect, page, 2);
  });

  test("setas não navegam quando o foco está no campo de página", async ({ page }) => {
    await openBookWithPages(page, 3);

    await page.locator("#page-input").focus();
    await page.keyboard.press("ArrowRight");

    await expectRenderedPage(expect, page, 1);
  });

  test("cliques rápidos em sequência terminam na página certa, sem erros", async ({ page }) => {
    const errors = collectErrors(page);
    await openBookWithPages(page, 5);

    for (let i = 0; i < 4; i++) {
      await page.locator("#next-button").click();
    }

    await expectRenderedPage(expect, page, 5);
    expect(errors).toEqual([]);
  });
});

test.describe("navegação pelas extremidades", () => {
  test("clicar na extremidade direita avança e na esquerda volta", async ({ page }) => {
    await openBookWithPages(page, 3);

    let p = await stagePoint(page, 0.92);
    await page.mouse.click(p.x, p.y);
    await expectRenderedPage(expect, page, 2);

    p = await stagePoint(page, 0.92);
    await page.mouse.click(p.x, p.y);
    await expectRenderedPage(expect, page, 3);

    p = await stagePoint(page, 0.08);
    await page.mouse.click(p.x, p.y);
    await expectRenderedPage(expect, page, 2);
  });

  test("clicar no centro não troca de página", async ({ page }) => {
    await openBookWithPages(page, 3);

    const p = await stagePoint(page, 0.5);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(150);

    await expectRenderedPage(expect, page, 1);
    expect(await storedPage(page)).toBe(1);
  });

  test("clicar na extremidade esquerda da primeira página não quebra", async ({ page }) => {
    const errors = collectErrors(page);
    await openBookWithPages(page, 3);

    const p = await stagePoint(page, 0.05);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(150);

    await expectRenderedPage(expect, page, 1);
    expect(errors).toEqual([]);
  });
});

test.describe("progresso de leitura", () => {
  test("cada mudança de página é gravada no IndexedDB", async ({ page }) => {
    await openBookWithPages(page, 5);

    await page.locator("#next-button").click();
    await page.locator("#next-button").click();
    await expectRenderedPage(expect, page, 3);

    await expect.poll(() => storedPage(page)).toBe(3);
  });

  test("a biblioteca mostra a última página lida ao voltar", async ({ page }) => {
    await openBookWithPages(page, 5);
    await page.locator("#next-button").click();
    await expectRenderedPage(expect, page, 2);
    await expect.poll(() => storedPage(page)).toBe(2);

    await page.locator("#back-button").click();

    await expect(page.locator("#book-list .book-meta")).toHaveText("Página atual: 2");
  });

  test("reabrir o livro retoma da última página", async ({ page }) => {
    await openBookWithPages(page, 5);
    await page.locator("#page-input").fill("4");
    await page.locator("#page-input").blur();
    await expectRenderedPage(expect, page, 4);
    await expect.poll(() => storedPage(page)).toBe(4);

    await page.locator("#back-button").click();
    await openFirstBook(page);

    await expectRenderedPage(expect, page, 4);
    await expect(page.locator("#page-input")).toHaveValue("4");
  });

  test("o progresso sobrevive ao fechar e reabrir o navegador (recarregar)", async ({ page }) => {
    await openBookWithPages(page, 5);
    await page.locator("#next-button").click();
    await page.locator("#next-button").click();
    await expectRenderedPage(expect, page, 3);
    await expect.poll(() => storedPage(page)).toBe(3);

    await page.reload();
    await expect(page.locator("#book-list .book-meta")).toHaveText("Página atual: 3");
    await openFirstBook(page);

    await expectRenderedPage(expect, page, 3);
  });

  test("abrir o livro sem mudar de página não altera o progresso salvo", async ({ page }) => {
    await openBookWithPages(page, 5);
    await page.locator("#next-button").click();
    await expect.poll(() => storedPage(page)).toBe(2);

    await page.locator("#back-button").click();
    await openFirstBook(page);
    await page.locator("#back-button").click();

    expect(await storedPage(page)).toBe(2);
  });
});

test.describe("ajuste à tela e rolagem", () => {
  /** Mede a página renderizada em relação à área disponível. */
  async function measure(page) {
    return page.evaluate(() => {
      const stage = document.getElementById("stage").getBoundingClientRect();
      const canvas = document.getElementById("page-canvas").getBoundingClientRect();
      return {
        stage: { w: stage.width, h: stage.height, top: stage.top, bottom: stage.bottom },
        canvas: { w: canvas.width, h: canvas.height, top: canvas.top, bottom: canvas.bottom },
        docScrollH: document.documentElement.scrollHeight,
        docClientH: document.documentElement.clientHeight,
        bodyScrollH: document.body.scrollHeight,
        winH: window.innerHeight,
      };
    });
  }

  function expectFits(m, ratio) {
    // Nunca ultrapassa a área disponível (tolerância de arredondamento).
    expect(m.canvas.w).toBeLessThanOrEqual(m.stage.w + 1);
    expect(m.canvas.h).toBeLessThanOrEqual(m.stage.h + 1);
    // Aproveita a tela: ao menos uma dimensão preenche a área.
    const fillsW = Math.abs(m.canvas.w - m.stage.w) <= 2;
    const fillsH = Math.abs(m.canvas.h - m.stage.h) <= 2;
    expect(fillsW || fillsH).toBe(true);
    // Mantém a proporção do PDF.
    expect(m.canvas.w / m.canvas.h).toBeCloseTo(ratio, 1);
  }

  test("página retrato em tela paisagem cabe inteira, sem rolagem vertical", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBookWithPages(page, 2);

    const m = await measure(page);
    expectFits(m, 612 / 792);
    expect(m.docScrollH).toBeLessThanOrEqual(m.docClientH);
    expect(m.bodyScrollH).toBeLessThanOrEqual(m.winH);
  });

  test("página retrato em tela retrato cabe inteira, sem rolagem vertical", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 1000 });
    await openBookWithPages(page, 2);

    const m = await measure(page);
    expectFits(m, 612 / 792);
    expect(m.docScrollH).toBeLessThanOrEqual(m.docClientH);
  });

  test("página paisagem (PDF largo) também cabe inteira", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await importPdf(page, pdfFile("largo.pdf", { pages: 1, width: 842, height: 595 }));
    await openFirstBook(page);

    expectFits(await measure(page), 842 / 595);
  });

  test("tentar rolar a tela com a roda do mouse não desloca nada", async ({ page }) => {
    await openBookWithPages(page, 2);

    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(100);

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);
  });

  test("girar a tela (redimensionar) reajusta a página à nova área", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBookWithPages(page, 2);
    const before = await measure(page);

    await page.setViewportSize({ width: 800, height: 1280 });
    await expect
      .poll(async () => (await measure(page)).canvas.w)
      .not.toBeCloseTo(before.canvas.w, 0);

    const after = await measure(page);
    expectFits(after, 612 / 792);
    expect(after.docScrollH).toBeLessThanOrEqual(after.docClientH);
    // A página continua sendo a mesma após o reajuste.
    await expectRenderedPage(expect, page, 1);
  });

  test("redimensionar não gera erros de renderização duplicada", async ({ page }) => {
    const errors = collectErrors(page);
    await openBookWithPages(page, 2);

    for (const [w, h] of [[1000, 700], [700, 1000], [1280, 800], [900, 900]]) {
      await page.setViewportSize({ width: w, height: h });
    }
    await page.waitForTimeout(300);

    await expectRenderedPage(expect, page, 1);
    expect(errors).toEqual([]);
  });
});

test.describe("nitidez em telas de alta densidade", () => {
  test.use({ deviceScaleFactor: 2 });

  test("o canvas é desenhado com o dobro de pixels do tamanho exibido", async ({ page }) => {
    await openBookWithPages(page, 1);

    const { bufferW, cssW } = await page.evaluate(() => {
      const c = document.getElementById("page-canvas");
      return { bufferW: c.width, cssW: parseFloat(c.style.width) };
    });

    expect(bufferW / cssW).toBeCloseTo(2, 1);
  });
});
