const { test, expect } = require("@playwright/test");
const { pdfFile, readStoredBooks } = require("../helpers/e2e-helpers");

// Testa o módulo book-storage.js diretamente, com o IndexedDB real do Chromium.
// Cada teste roda em um contexto de navegador novo, portanto com banco vazio.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

/** Executa código no navegador com o módulo de storage importado. */
function withStorage(page, fn, arg) {
  return page.evaluate(
    async ({ fnSource, arg }) => {
      const storage = await import("/src/storage/book-storage.js");
      return new Function("storage", "arg", `return (${fnSource})(storage, arg)`)(
        storage,
        arg
      );
    },
    { fnSource: fn.toString(), arg }
  );
}

async function fileArg() {
  const f = pdfFile("a.pdf", { pages: 2 });
  return { name: f.name, bytes: Array.from(f.buffer) };
}

test("saveBook cria o registro com os valores iniciais esperados", async ({ page }) => {
  const arg = await fileArg();

  const book = await withStorage(
    page,
    async (storage, arg) => {
      const file = new File([new Uint8Array(arg.bytes)], arg.name, {
        type: "application/pdf",
      });
      const before = Date.now();
      const saved = await storage.saveBook(file, arg.cover);
      return {
        id: saved.id,
        name: saved.name,
        currentPage: saved.currentPage,
        cover: saved.cover,
        isCoverBlob: saved.cover instanceof Blob,
        isBlob: saved.file instanceof Blob,
        size: saved.file.size,
        createdAtOk: saved.createdAt >= before && saved.createdAt <= Date.now(),
      };
    },
    arg
  );

  expect(book.id).toMatch(/^book-/);
  expect(book.name).toBe("a.pdf");
  expect(book.currentPage).toBe(1);
  expect(book.isBlob).toBe(true);
  expect(book.isCoverBlob).toBe(true);;
  expect(book.size).toBe(arg.bytes.length);
  expect(book.createdAtOk).toBe(true);
});

test("o arquivo é guardado como binário (Blob), sem conversão para Base64", async ({ page }) => {
  const arg = await fileArg();

  await withStorage(
    page,
    async (storage, arg) => {
      await storage.saveBook(
        new File([new Uint8Array(arg.bytes)], arg.name, { type: "application/pdf" })
      );
    },
    arg
  );

  const [stored] = await readStoredBooks(page);
  expect(stored.isBlob).toBe(true);
  expect(stored.size).toBe(arg.bytes.length); // Base64 aumentaria ~33%
});

test("cada livro recebe um id único", async ({ page }) => {
  const ids = await withStorage(page, async (storage) => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      const b = await storage.saveBook(
        new File(["x"], `l${i}.pdf`, { type: "application/pdf" })
      );
      out.push(b.id);
    }
    return out;
  });

  expect(new Set(ids).size).toBe(5);
});

test("getBook devolve o livro salvo, com o conteúdo intacto", async ({ page }) => {
  const arg = await fileArg();

  const result = await withStorage(
    page,
    async (storage, arg) => {
      const saved = await storage.saveBook(
        new File([new Uint8Array(arg.bytes)], arg.name, { type: "application/pdf" })
      );
      const loaded = await storage.getBook(saved.id);
      const bytes = Array.from(new Uint8Array(await loaded.file.arrayBuffer()));
      return { sameId: loaded.id === saved.id, name: loaded.name, bytes };
    },
    arg
  );

  expect(result.sameId).toBe(true);
  expect(result.name).toBe("a.pdf");
  expect(result.bytes).toEqual(arg.bytes);
});

test("getBook devolve null para id inexistente", async ({ page }) => {
  const result = await withStorage(page, (storage) => storage.getBook("book-nao-existe"));
  expect(result).toBeNull();
});

test("getAllBooks devolve lista vazia quando não há livros", async ({ page }) => {
  const result = await withStorage(page, async (storage) => (await storage.getAllBooks()).length);
  expect(result).toBe(0);
});

test("getAllBooks lista do mais recente para o mais antigo", async ({ page }) => {
  const names = await withStorage(page, async (storage) => {
    for (const n of ["primeiro.pdf", "segundo.pdf", "terceiro.pdf"]) {
      await storage.saveBook(new File(["x"], n, { type: "application/pdf" }));
      await new Promise((r) => setTimeout(r, 5)); // garante createdAt distinto
    }
    return (await storage.getAllBooks()).map((b) => b.name);
  });

  expect(names).toEqual(["terceiro.pdf", "segundo.pdf", "primeiro.pdf"]);
});

test("updateCurrentPage grava a página e preserva o arquivo e o nome", async ({ page }) => {
  const arg = await fileArg();

  const result = await withStorage(
    page,
    async (storage, arg) => {
      const saved = await storage.saveBook(
        new File([new Uint8Array(arg.bytes)], arg.name, { type: "application/pdf" })
      );
      await storage.updateCurrentPage(saved.id, 7);
      const loaded = await storage.getBook(saved.id);
      return {
        currentPage: loaded.currentPage,
        name: loaded.name,
        size: loaded.file.size,
        createdAtKept: loaded.createdAt === saved.createdAt,
      };
    },
    arg
  );

  expect(result.currentPage).toBe(7);
  expect(result.name).toBe("a.pdf");
  expect(result.size).toBe(arg.bytes.length);
  expect(result.createdAtKept).toBe(true);
});

test("updateCurrentPage só altera o livro indicado", async ({ page }) => {
  const pages = await withStorage(page, async (storage) => {
    const a = await storage.saveBook(new File(["x"], "a.pdf", { type: "application/pdf" }));
    const b = await storage.saveBook(new File(["y"], "b.pdf", { type: "application/pdf" }));
    await storage.updateCurrentPage(a.id, 9);
    return {
      a: (await storage.getBook(a.id)).currentPage,
      b: (await storage.getBook(b.id)).currentPage,
    };
  });

  expect(pages).toEqual({ a: 9, b: 1 });
});

test("updateCurrentPage rejeita quando o livro não existe e não cria registro", async ({ page }) => {
  const result = await withStorage(page, async (storage) => {
    let message = null;
    try {
      await storage.updateCurrentPage("book-fantasma", 3);
    } catch (e) {
      message = e.message;
    }
    return { message, total: (await storage.getAllBooks()).length };
  });

  expect(result.message).toContain("book-fantasma");
  expect(result.total).toBe(0);
});

test("os dados persistem após recarregar a página", async ({ page }) => {
  await withStorage(page, async (storage) => {
    const b = await storage.saveBook(new File(["x"], "persistente.pdf", { type: "application/pdf" }));
    await storage.updateCurrentPage(b.id, 4);
  });

  await page.reload();

  const [stored] = await readStoredBooks(page);
  expect(stored.name).toBe("persistente.pdf");
  expect(stored.currentPage).toBe(4);
});

test("o banco usa o nome, a versão e a store definidos na documentação", async ({ page }) => {
  await withStorage(page, (storage) =>
    storage.saveBook(new File(["x"], "a.pdf", { type: "application/pdf" }))
  );

  const info = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("anki-reader");
        req.onsuccess = () => {
          const db = req.result;
          const out = {
            version: db.version,
            stores: Array.from(db.objectStoreNames),
            keyPath: db.transaction("books").objectStore("books").keyPath,
          };
          db.close();
          resolve(out);
        };
      })
  );

  expect(info).toEqual({ version: 1, stores: ["books"], keyPath: "id" });
});
