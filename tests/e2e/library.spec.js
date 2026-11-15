const { test, expect } = require("@playwright/test");
const {
  pdfFile,
  importPdf,
  openFirstBook,
  expectRenderedPage,
  readStoredBooks,
  collectErrors,
} = require("../helpers/e2e-helpers");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test.describe("biblioteca", () => {
  test("começa vazia e mostra a mensagem de estado vazio", async ({ page }) => {
    await expect(page.locator("#empty-message")).toBeVisible();
    await expect(page.locator("#book-list li")).toHaveCount(0);
  });

  test("importar um PDF o adiciona à biblioteca na página 1", async ({ page }) => {
    await importPdf(page, pdfFile("english-book.pdf"));

    await expect(page.locator("#empty-message")).toBeHidden();
    await expect(page.locator("#book-list li")).toHaveCount(1);
    await expect(page.locator("#book-list .book-name")).toHaveText("english-book.pdf");
    await expect(page.locator("#book-list .book-meta")).toHaveText("Página atual: 1");
  });

  test("o PDF fica salvo no navegador (IndexedDB), não só na tela", async ({ page }) => {
    const file = pdfFile("salvo.pdf");
    await importPdf(page, file);

    const stored = await readStoredBooks(page);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      name: "salvo.pdf",
      currentPage: 1,
      isBlob: true,
      size: file.buffer.length,
    });
  });

  test("o PDF nunca é enviado ao servidor (processamento local)", async ({ page }) => {
    const uploads = [];
    page.on("request", (r) => {
      if (r.method() !== "GET") uploads.push(`${r.method()} ${r.url()}`);
    });

    await importPdf(page, pdfFile());
    await openFirstBook(page);

    expect(uploads).toEqual([]);
  });

  test("a biblioteca sobrevive ao recarregamento da página", async ({ page }) => {
    await importPdf(page, pdfFile("sobrevive.pdf"));
    await page.reload();

    await expect(page.locator("#book-list .book-name")).toHaveText("sobrevive.pdf");
  });

  test("vários livros: o mais recente aparece primeiro", async ({ page }) => {
    await importPdf(page, pdfFile("antigo.pdf"));
    await page.waitForTimeout(10);
    await importPdf(page, pdfFile("novo.pdf"));

    await expect(page.locator("#book-list .book-name")).toHaveText(["novo.pdf", "antigo.pdf"]);
  });

  test("arquivo que não é PDF é recusado e nada é salvo", async ({ page }) => {
    let dialogMessage = null;
    page.on("dialog", async (d) => {
      dialogMessage = d.message();
      await d.accept();
    });

    await page.locator("#file-input").setInputFiles({
      name: "notas.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("não sou um pdf"),
    });

    await expect.poll(() => dialogMessage).toBe("Selecione um arquivo PDF.");
    await expect(page.locator("#book-list li")).toHaveCount(0);
    expect(await readStoredBooks(page)).toEqual([]);
  });
});

test.describe("abertura do livro", () => {
  test("abrir mostra o leitor, esconde a biblioteca e renderiza a página 1", async ({ page }) => {
    const errors = collectErrors(page);
    await importPdf(page, pdfFile("abrir.pdf", { pages: 5 }));
    await openFirstBook(page);

    await expect(page.locator("#reader")).toBeVisible();
    await expect(page.locator("#library-view")).toBeHidden();
    await expect(page.locator("#app-header")).toBeHidden();
    await expect(page.locator("#reader-title")).toHaveText("abrir.pdf");
    await expectRenderedPage(expect, page, 1);
    await expect(page.locator("#page-input")).toHaveValue("1");
    await expect(page.locator("#page-total")).toHaveText("/ 5");

    expect(errors).toEqual([]);
  });

  test("voltar à biblioteca restaura a lista e libera o leitor", async ({ page }) => {
    await importPdf(page, pdfFile());
    await openFirstBook(page);
    await page.locator("#back-button").click();

    await expect(page.locator("#reader")).toBeHidden();
    await expect(page.locator("#library-view")).toBeVisible();
    await expect(page.locator("#app-header")).toBeVisible();
    await expect(page.locator("body")).not.toHaveClass(/reading/);
  });

  test("PDF corrompido avisa o usuário e volta para a biblioteca", async ({ page }) => {
    const dialogs = [];
    page.on("dialog", async (d) => {
      dialogs.push(d.message());
      await d.accept();
    });
    // O erro é tratado e reportado ao usuário; o console.error esperado é ignorado.
    page.on("pageerror", () => {});

    await page.locator("#file-input").setInputFiles({
      name: "quebrado.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("isto não é um PDF válido"),
    });
    await page.locator("#import-label").first().click();

    await expect.poll(() => dialogs).toContain("Não foi possível importar este arquivo.");
    await expect(page.locator("#reader")).toBeHidden();
    await expect(page.locator("#library-view")).toBeVisible();
  });
});
