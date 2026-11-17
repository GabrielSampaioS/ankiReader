const fs = require("fs");
const { test, expect } = require("@playwright/test");
const {
  pdfFile,
  importPdf,
  openFirstBook,
  collectErrors,
} = require("../helpers/e2e-helpers");

// Painel "Novo cartão": seleção -> frente + frase de contexto -> verso -> envio.

const LINES = [
  { str: "The quick brown fox jumps over the lazy dog.", x: 100, y: 700, size: 16 },
  { str: "Reading helps vocabulary grow. Do you read every day?", x: 100, y: 660, size: 16 },
];
const SENTENCE_1 = "The quick brown fox jumps over the lazy dog.";
const SENTENCE_2 = "Reading helps vocabulary grow.";

async function openReader(page) {
  await page.goto("/");
  await importPdf(page, pdfFile("anki.pdf", { pages: 2, text: LINES }));
  await openFirstBook(page);
  await page.waitForFunction(
    () => document.querySelectorAll("#text-layer span").length >= 2
  );
}

/** Centro e bordas (px de tela) de uma palavra na camada de texto. */
function wordBox(page, word) {
  return page.evaluate((w) => {
    const walker = document.createTreeWalker(
      document.getElementById("text-layer"),
      NodeFilter.SHOW_TEXT
    );
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.nodeValue.indexOf(w);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + w.length);
      const b = r.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, left: b.left, right: b.right };
    }
    return null;
  }, word);
}

async function selectWord(page, word) {
  const box = await wordBox(page, word);
  expect(box, `palavra "${word}" não encontrada`).not.toBeNull();
  await page.mouse.dblclick(box.x, box.y);
}

async function selectRange(page, fromWord, toWord) {
  const a = await wordBox(page, fromWord);
  const b = await wordBox(page, toWord);
  await page.mouse.move(a.left + 1, a.y);
  await page.mouse.down();
  await page.mouse.move(b.right - 1, b.y, { steps: 8 });
  await page.mouse.up();
}

const panel = (page) => page.locator("#card-panel");

/** Simula o Web Share (existe só em HTTPS/Android) e guarda o que foi enviado. */
async function stubShare(page) {
  await page.addInitScript(() => {
    window.__shared = [];
    navigator.share = async (data) => {
      window.__shared.push(data);
    };
  });
}

test.describe("seleção e painel", () => {
  test("selecionar uma palavra abre o painel com a frente e a frase", async ({ page }) => {
    const errors = collectErrors(page);
    await openReader(page);

    await expect(panel(page)).toBeHidden();
    await selectWord(page, "brown");

    await expect(panel(page)).toBeVisible();
    await expect(page.locator("#card-front")).toHaveValue("brown");
    await expect(page.locator("#card-context")).toHaveText(SENTENCE_1);
    await expect(page.locator("#card-back")).toHaveValue("");

    expect(errors).toEqual([]);
  });

  test("a frase certa é escolhida quando há várias na mesma linha", async ({ page }) => {
    await openReader(page);
    await selectWord(page, "vocabulary");

    await expect(page.locator("#card-front")).toHaveValue("vocabulary");
    await expect(page.locator("#card-context")).toHaveText(SENTENCE_2);
  });

  test("arrastar seleciona um trecho e o usa como frente", async ({ page }) => {
    await openReader(page);
    await selectRange(page, "quick", "fox");

    await expect(panel(page)).toBeVisible();
    await expect(page.locator("#card-front")).toHaveValue("quick brown fox");
    await expect(page.locator("#card-context")).toHaveText(SENTENCE_1);
  });

  test("abrir o painel não muda o tamanho da página nem a redesenha", async ({ page }) => {
    await openReader(page);
    const rect = () =>
      page.evaluate(() => {
        const r = document.getElementById("page-canvas").getBoundingClientRect();
        const s = document.getElementById("stage").getBoundingClientRect();
        return { cw: r.width, ch: r.height, sw: s.width, sh: s.height };
      });
    const before = await rect();

    await selectWord(page, "brown");
    await expect(panel(page)).toBeVisible();
    await page.waitForTimeout(300);

    expect(await rect()).toEqual(before);
    // Se a página tivesse sido redesenhada, a seleção teria sumido.
    expect(await page.evaluate(() => getSelection().toString())).toBe("brown");
  });

  test("tocar no campo do verso e demorar para digitar não fecha o painel", async ({ page }) => {
    await openReader(page);
    await selectWord(page, "brown");
    await expect(panel(page)).toBeVisible();

    // Tocar no campo tira a seleção da página. O usuário pode levar alguns
    // segundos pensando no verso: o painel não pode sumir nesse intervalo.
    await page.locator("#card-back").click();
    await page.waitForTimeout(600);
    await expect(panel(page)).toBeVisible();

    await page.locator("#card-back").pressSequentially("marrom");
    await page.waitForTimeout(300);

    await expect(panel(page)).toBeVisible();
    await expect(page.locator("#card-front")).toHaveValue("brown");
    await expect(page.locator("#card-back")).toHaveValue("marrom");
  });

  test("selecionar outra palavra troca o cartão e limpa o verso", async ({ page }) => {
    await openReader(page);
    await selectWord(page, "brown");
    await page.locator("#card-back").fill("marrom");

    await selectWord(page, "lazy");

    await expect(page.locator("#card-front")).toHaveValue("lazy");
    await expect(page.locator("#card-back")).toHaveValue("");
  });

  test("tirar a seleção fecha o painel quando nada foi digitado", async ({ page }) => {
    await openReader(page);
    await selectWord(page, "brown");
    await expect(panel(page)).toBeVisible();

    await page.evaluate(() => getSelection().removeAllRanges());

    await expect(panel(page)).toBeHidden();
  });

  test("tirar a seleção NÃO fecha o painel se o usuário já digitou o verso", async ({ page }) => {
    await openReader(page);
    await selectWord(page, "brown");
    await page.locator("#card-back").fill("marrom");
    await page.locator("#card-back").blur();

    await page.evaluate(() => getSelection().removeAllRanges());
    await page.waitForTimeout(500);

    await expect(panel(page)).toBeVisible();
    await expect(page.locator("#card-back")).toHaveValue("marrom");
  });

  test("o botão × fecha o painel", async ({ page }) => {
    await openReader(page);
    await selectWord(page, "brown");
    await page.locator("#card-close").click();

    await expect(panel(page)).toBeHidden();
  });

  test("trocar de página fecha o painel", async ({ page }) => {
    await openReader(page);
    await selectWord(page, "brown");
    await expect(panel(page)).toBeVisible();

    await page.locator("#next-button").click();

    await expect(page.locator("#page-input")).toHaveValue("2");
    await expect(panel(page)).toBeHidden();
  });

  test("trocar de página fecha o painel mesmo com o verso já digitado", async ({ page }) => {
    await openReader(page);
    await selectWord(page, "brown");
    await page.locator("#card-back").fill("marrom");
    await page.locator("#card-back").blur();

    await page.locator("#next-button").click();

    await expect(page.locator("#page-input")).toHaveValue("2");
    await expect(panel(page)).toBeHidden();
    await expect(page.locator("#card-back")).toHaveValue("");
  });

  test("reabrir o livro não mostra o cartão da leitura anterior", async ({ page }) => {
    await openReader(page);
    await selectWord(page, "brown");
    await page.locator("#card-back").fill("marrom");
    await page.locator("#card-back").blur();

    await page.locator("#back-button").click();
    await openFirstBook(page);

    await expect(panel(page)).toBeHidden();
    await expect(page.locator("#card-front")).toHaveValue("");
    await expect(page.locator("#card-back")).toHaveValue("");
  });

  test("voltar à biblioteca fecha o painel", async ({ page }) => {
    await openReader(page);
    await selectWord(page, "brown");
    await expect(panel(page)).toBeVisible();

    await page.locator("#back-button").click();

    await expect(panel(page)).toBeHidden();
  });
});

test.describe("envio ao AnkiDroid (compartilhar)", () => {
  test("title vira a frente e text o verso com a frase", async ({ page }) => {
    await stubShare(page);
    await openReader(page);
    await selectWord(page, "brown");
    await page.locator("#card-back").fill("marrom");

    await page.locator("#card-share").click();

    await expect(page.locator("#card-status")).toHaveText("Enviado para o compartilhamento.");
    expect(await page.evaluate(() => window.__shared)).toEqual([
      { title: "brown", text: `marrom\n\n${SENTENCE_1}` },
    ]);
  });

  test("sem verso digitado, o verso é a frase", async ({ page }) => {
    await stubShare(page);
    await openReader(page);
    await selectWord(page, "brown");

    await page.locator("#card-share").click();

    expect(await page.evaluate(() => window.__shared)).toEqual([
      { title: "brown", text: SENTENCE_1 },
    ]);
  });

  test("com “Incluir a frase” desligado, só vai o que foi digitado", async ({ page }) => {
    await stubShare(page);
    await openReader(page);
    await selectWord(page, "brown");
    await page.locator("#card-back").fill("marrom");
    await page.locator("#card-include-context").uncheck();

    await page.locator("#card-share").click();

    expect(await page.evaluate(() => window.__shared)).toEqual([
      { title: "brown", text: "marrom" },
    ]);
  });

  test("a frente pode ser editada antes de enviar", async ({ page }) => {
    await stubShare(page);
    await openReader(page);
    await selectWord(page, "brown");
    await page.locator("#card-front").fill("quick brown");
    await page.locator("#card-include-context").uncheck();

    await page.locator("#card-share").click();

    expect(await page.evaluate(() => window.__shared)).toEqual([{ title: "quick brown" }]);
  });

  test("frente vazia não envia e avisa", async ({ page }) => {
    await stubShare(page);
    await openReader(page);
    await selectWord(page, "brown");
    await page.locator("#card-front").fill("   ");

    await page.locator("#card-share").click();

    await expect(page.locator("#card-status")).toHaveText("Preencha a frente do cartão.");
    expect(await page.evaluate(() => window.__shared)).toEqual([]);
  });

  test("cancelar a lista de apps não é tratado como erro", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.share = async () => {
        throw new DOMException("cancelado", "AbortError");
      };
    });
    const errors = collectErrors(page);
    await openReader(page);
    await selectWord(page, "brown");

    await page.locator("#card-share").click();
    await page.waitForTimeout(200);

    await expect(page.locator("#card-status")).toHaveText("");
    expect(errors).toEqual([]);
  });

  test("falha real do compartilhamento orienta a usar o arquivo", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.share = async () => {
        throw new DOMException("sem permissão", "NotAllowedError");
      };
    });
    page.on("console", () => {}); // o erro é registrado de propósito
    await openReader(page);
    await selectWord(page, "brown");

    await page.locator("#card-share").click();

    await expect(page.locator("#card-status")).toContainText("Baixar arquivo");
  });

  test("sem Web Share (HTTP): botão desabilitado e dica visível", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    });
    await openReader(page);
    await selectWord(page, "brown");

    await expect(page.locator("#card-share")).toBeDisabled();
    await expect(page.locator("#card-hint")).toBeVisible();
    await expect(page.locator("#card-download")).toBeEnabled();
  });

  test("com Web Share disponível: botão habilitado e dica escondida", async ({ page }) => {
    await stubShare(page);
    await openReader(page);
    await selectWord(page, "brown");

    await expect(page.locator("#card-share")).toBeEnabled();
    await expect(page.locator("#card-hint")).toBeHidden();
  });
});

test.describe("arquivo para importar", () => {
  async function downloadFile(page) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#card-download").click(),
    ]);
    return {
      name: download.suggestedFilename(),
      content: fs.readFileSync(await download.path(), "utf8"),
    };
  }

  test("baixa um .txt no formato de importação do Anki", async ({ page }) => {
    await openReader(page);
    await selectWord(page, "brown");
    await page.locator("#card-back").fill("marrom");

    const file = await downloadFile(page);

    expect(file.name).toBe("anki-brown.txt");
    expect(file.content).toBe(
      `#separator:tab\n#html:false\nbrown\t"marrom\n\n${SENTENCE_1}"\n`
    );
    await expect(page.locator("#card-status")).toContainText("Importar arquivo");
  });

  test("verso só digitado fica em uma linha, sem aspas", async ({ page }) => {
    await openReader(page);
    await selectWord(page, "brown");
    await page.locator("#card-back").fill("marrom");
    await page.locator("#card-include-context").uncheck();

    const file = await downloadFile(page);

    expect(file.content).toBe("#separator:tab\n#html:false\nbrown\tmarrom\n");
  });

  test("frente vazia não gera arquivo", async ({ page }) => {
    await openReader(page);
    await selectWord(page, "brown");
    await page.locator("#card-front").fill("");

    let downloaded = false;
    page.on("download", () => {
      downloaded = true;
    });
    await page.locator("#card-download").click();
    await page.waitForTimeout(300);

    expect(downloaded).toBe(false);
    await expect(page.locator("#card-status")).toHaveText("Preencha a frente do cartão.");
  });
});
