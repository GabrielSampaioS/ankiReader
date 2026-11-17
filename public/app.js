
import {
  saveBook,
  getBook,
  getAllBooks,
  updateCurrentPage,
} from "/src/storage/book-storage.js";
import { generateCover } from "/src/reader/cover-generator.js";
import { PdfViewer } from "/src/reader/pdf-viewer.js";
import { resolveEdgeAction } from "/src/reader/reader-math.mjs";
import { createCardPanel } from "/src/anki/card-panel.js";

// ---------- Configurações ----------

const EDGE_ZONE = 0.25;

// ---------- Elementos da interface ----------

const elements = {
  fileInput: document.getElementById("file-input"),
  appHeader: document.getElementById("app-header"),
  bookList: document.getElementById("book-list"),
  emptyMessage: document.getElementById("empty-message"),
  libraryView: document.getElementById("library-view"),
  reader: document.getElementById("reader"),
  readerTitle: document.getElementById("reader-title"),
  stage: document.getElementById("stage"),
  canvas: document.getElementById("page-canvas"),
  pageInput: document.getElementById("page-input"),
  pageTotal: document.getElementById("page-total"),
  prevButton: document.getElementById("prev-button"),
  nextButton: document.getElementById("next-button"),
  backButton: document.getElementById("back-button"),
};

// ---------- Estado da aplicação ----------

const state = {
  currentBookId: null,
  refitFrame: null,
};

// ---------- Visualizador PDF ----------

const viewer = new PdfViewer({
  container: elements.stage,
  canvas: elements.canvas,
  onPageChange: handlePageChange,
});

// ---------- Painel do cartão do Anki ----------

const cardPanel = createCardPanel({
  textLayer: document.getElementById("text-layer"),
  isReaderActive: () => state.currentBookId !== null,
});

// ---------- Biblioteca ----------

async function renderLibrary() {
  const books = await getAllBooks();

  elements.bookList.innerHTML = "";
  elements.emptyMessage.classList.toggle("hidden", books.length > 0);

  for (const book of books) {
    const item = createBookItem(book);
    elements.bookList.append(item);
  }
}


function createBookItem(book) {
  const item = document.createElement("li");
  item.className = "book-card";

  const openButton = document.createElement("button");
  openButton.className = "book-open";
  openButton.type = "button";
  openButton.setAttribute("aria-label", `Abrir ${book.name}`);

  const cover = document.createElement("div");
  cover.className = "book-cover";

  const coverImage = document.createElement("img");
  coverImage.className = "book-cover-image";
  coverImage.alt = `Capa de ${book.name}`;

  if (book.cover) {
    coverImage.src = URL.createObjectURL(book.cover);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "book-cover-placeholder";
    placeholder.textContent = "PDF";
    cover.append(placeholder);
  }

  const info = document.createElement("div");
  info.className = "book-info";

  const name = document.createElement("h3");
  name.className = "book-name";
  name.textContent = book.name;

  const meta = document.createElement("p");
  meta.className = "book-meta";
  meta.textContent = `Página atual: ${book.currentPage}`;

  if (book.cover) {
    cover.append(coverImage);
  }

  info.append(name, meta);
  openButton.append(cover, info);

  openButton.addEventListener("click", () => openBook(book.id));

  item.append(openButton);

  return item;
}


// ---------- Importação de arquivos ----------

async function handleFileImport() {
  const file = elements.fileInput.files[0];

  if (!file) return;

  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    alert("Selecione um arquivo PDF.");
    elements.fileInput.value = "";
    return;
  }

  try {
    const cover = await generateCover(file);
    await saveBook(file, cover);
    await renderLibrary();
  } catch (error) {
    console.error("Erro ao salvar PDF:", error);
    alert("Não foi possível importar este arquivo.");
  } finally {
    elements.fileInput.value = "";
  }
}

// ---------- Leitor ----------

async function openBook(id) {
  const book = await getBook(id);

  if (!book) {
    alert("Este livro não foi encontrado.");
    return;
  }

  state.currentBookId = book.id;
  elements.readerTitle.textContent = book.name;

  showReader();

  try {
    await viewer.load(book.file, book.currentPage);
    updatePageControls(viewer.page, viewer.numPages);
  } catch (error) {
    console.error("Erro ao abrir PDF:", error);
    alert("Não foi possível abrir este PDF.");
    await closeBook();
  }
}

function showReader() {
  document.body.classList.add("reading");

  elements.appHeader.classList.add("hidden");
  elements.libraryView.classList.add("hidden");
  elements.reader.classList.remove("hidden");
}

async function closeBook() {
  try {
    await viewer.destroy();
  } catch (error) {
    console.error("Erro ao liberar visualizador:", error);
  }

  state.currentBookId = null;
  cardPanel.close();

  elements.reader.classList.add("hidden");
  document.body.classList.remove("reading");

  elements.appHeader.classList.remove("hidden");
  elements.libraryView.classList.remove("hidden");

  await renderLibrary();
}

// ---------- Progresso de leitura ----------

function handlePageChange(page, total) {
  updatePageControls(page, total);

  // Trocar de página limpa a seleção; o cartão em edição não faz mais sentido.
  cardPanel.close();

  if (!state.currentBookId) return;

  updateCurrentPage(state.currentBookId, page).catch((error) => {
    console.error("Erro ao salvar progresso:", error);
  });
}

function updatePageControls(page, total) {
  elements.pageInput.value = page;
  elements.pageInput.max = total;
  elements.pageTotal.textContent = `/ ${total}`;

  elements.prevButton.disabled = page <= 1;
  elements.nextButton.disabled = page >= total;
}

// ---------- Navegação entre páginas ----------

function goToPreviousPage() {
  viewer.prev();
}

function goToNextPage() {
  viewer.next();
}

function handlePageInput() {
  viewer.goTo(elements.pageInput.value);
}

function handleStageClick(event) {
  // Evita navegação quando o clique foi em um controle interativo.
  if (event.target.closest("button, input, a, select, textarea")) {
    return;
  }

  // Terminar de selecionar um texto também dispara "click": não vira página.
  if (window.getSelection()?.toString()) {
    return;
  }

  const rect = elements.stage.getBoundingClientRect();

  const action = resolveEdgeAction({
    clientX: event.clientX,
    left: rect.left,
    width: rect.width,
    zone: EDGE_ZONE,
  });

  if (action === "prev") viewer.prev();
  if (action === "next") viewer.next();
}

function handleKeyboardNavigation(event) {
  if (!state.currentBookId) return;

  // Não interfere na digitação de campos.
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement
  ) {
    return;
  }

  if (event.key === "ArrowLeft" || event.key === "PageUp") {
    event.preventDefault();
    viewer.prev();
  }

  if (event.key === "ArrowRight" || event.key === "PageDown") {
    event.preventDefault();
    viewer.next();
  }
}

// ---------- Redimensionamento ----------

function handleStageResize() {
  if (!state.currentBookId) return;

  cancelAnimationFrame(state.refitFrame);

  state.refitFrame = requestAnimationFrame(() => {
    viewer.refit();
  });
}

const resizeObserver = new ResizeObserver(handleStageResize);
resizeObserver.observe(elements.stage);

// ---------- Eventos ----------

function registerEvents() {
  elements.fileInput.addEventListener("change", handleFileImport);

  elements.prevButton.addEventListener("click", goToPreviousPage);
  elements.nextButton.addEventListener("click", goToNextPage);
  elements.pageInput.addEventListener("change", handlePageInput);
  elements.backButton.addEventListener("click", closeBook);

  elements.stage.addEventListener("click", handleStageClick);

  document.addEventListener("keydown", handleKeyboardNavigation);
}

// ---------- Inicialização ----------

async function init() {
  registerEvents();

  try {
    await renderLibrary();
  } catch (error) {
    console.error("Erro ao carregar biblioteca:", error);
    alert("Não foi possível carregar sua biblioteca.");
  }
}

init();
