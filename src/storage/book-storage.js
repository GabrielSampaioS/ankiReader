const DB_NAME = "anki-reader";
const DB_VERSION = 1;
const STORE_NAME = "books";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function generateId() {
  // crypto.randomUUID só existe em contexto seguro (https/localhost).
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return `book-${globalThis.crypto.randomUUID()}`;
  }

  return `book-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveBook(file, cover) {
  const db = await openDatabase();

  const book = {
    id: generateId(),
    name: file.name,
    file: file,
    cover,
    currentPage: 1,
    createdAt: Date.now(),
  };

  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).add(book);

  await transactionDone(transaction);
  db.close();

  return book;
}

export async function getBook(id) {
  const db = await openDatabase();

  const transaction = db.transaction(STORE_NAME, "readonly");
  const book = await requestToPromise(
    transaction.objectStore(STORE_NAME).get(id)
  );

  db.close();

  return book || null;
}

export async function getAllBooks() {
  const db = await openDatabase();

  const transaction = db.transaction(STORE_NAME, "readonly");
  const books = await requestToPromise(
    transaction.objectStore(STORE_NAME).getAll()
  );

  db.close();

  return books.sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateCurrentPage(id, page) {
  const db = await openDatabase();

  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);

  const book = await requestToPromise(store.get(id));

  if (!book) {
    db.close();
    throw new Error(`Livro não encontrado: ${id}`);
  }

  // Atualiza somente o campo da página, sem regravar o PDF em outro objeto.
  book.currentPage = page;
  store.put(book);

  await transactionDone(transaction);
  db.close();

  return book;
}
