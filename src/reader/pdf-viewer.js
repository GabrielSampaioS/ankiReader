import * as pdfjsLib from "/vendor/pdfjs/pdf.mjs";
import { clampPage, computeFitScale } from "/src/reader/reader-math.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.mjs";

/**
 * Renderiza UMA página por vez em um canvas, ajustada ao container.
 * Cache de páginas e pré-renderização ficam para a Etapa 3.
 */
export class PdfViewer {
  #container;
  #canvas;
  #onPageChange;
  #pdf = null;
  #loadingTask = null;
  #page = 1;
  #renderToken = 0;
  #task = null;
  #pageContainer;
  #textLayerContainer;
  #textLayer;

  constructor({ container, canvas, onPageChange = () => {} }) {
    this.#container = container;
    this.#canvas = canvas;
    this.#onPageChange = onPageChange;
    // Wrapper (.pdf-page) que contém o canvas e a camada de texto.
    this.#pageContainer = this.#canvas.parentElement;
    this.#textLayerContainer = this.#pageContainer.querySelector("#text-layer");
  }

  get page() {
    return this.#page;
  }

  get numPages() {
    return this.#pdf ? this.#pdf.numPages : 0;
  }

  async load(blob, startPage = 1) {
    await this.destroy();

    const data = new Uint8Array(await blob.arrayBuffer());
    const loadingTask = pdfjsLib.getDocument({ data });
    this.#loadingTask = loadingTask;
    this.#pdf = await loadingTask.promise;

    this.#page = this.#clamp(startPage);
    await this.#render();
  }

  async goTo(page) {
    if (!this.#pdf) return;

    const target = this.#clamp(page);
    if (target === this.#page) return;

    this.#page = target;
    this.#onPageChange(this.#page, this.numPages);
    await this.#render();
  }

  next() {
    return this.goTo(this.#page + 1);
  }

  prev() {
    return this.goTo(this.#page - 1);
  }

  // Chamado quando o tamanho da área disponível muda (rotação, resize).
  refit() {
    if (!this.#pdf) return Promise.resolve();
    return this.#render();
  }

  async destroy() {
    this.#renderToken++;

    if (this.#task) {
      this.#task.cancel();
      try {
        await this.#task.promise;
      } catch {}
      this.#task = null;
    }

    // O destroy() fica na loading task (o documento em si não o expõe):
    // ele encerra o worker e libera a memória do PDF.
    if (this.#loadingTask) {
      const task = this.#loadingTask;
      this.#loadingTask = null;
      this.#pdf = null;
      await task.destroy();
    }

    if (this.#textLayer) {
      this.#textLayer.cancel();
      this.#textLayer = null;
    }
    this.#textLayerContainer.innerHTML = "";

    this.#canvas.width = 0;
    this.#canvas.height = 0;
  }

  #clamp(page) {
    return clampPage(page, this.numPages);
  }

 async #render() {
  const token = ++this.#renderToken;

  // Limpa a camada de texto anterior.
  if (this.#textLayer) {
    this.#textLayer.cancel();
    this.#textLayer = null;
  }

  this.#textLayerContainer.innerHTML = "";

  // Evita renderizações duplicadas no mesmo canvas.
  if (this.#task) {
    this.#task.cancel();

    try {
      await this.#task.promise;
    } catch {}

    this.#task = null;
  }

  if (token !== this.#renderToken) return;

  const page = await this.#pdf.getPage(this.#page);

  if (token !== this.#renderToken) return;

  // Extrai o conteúdo textual da página.
  const textContent = await page.getTextContent();

  if (token !== this.#renderToken) return;

  // Calcula o espaço disponível.
  const availableWidth = this.#container.clientWidth;
  const availableHeight = this.#container.clientHeight;

  if (!availableWidth || !availableHeight) return;

  // Calcula a escala para ajustar a página ao container.
  const base = page.getViewport({ scale: 1 });

  const fitScale = computeFitScale({
    availableWidth,
    availableHeight,
    pageWidth: base.width,
    pageHeight: base.height,
  });

  // Viewport em tamanho CSS.
  const viewport = page.getViewport({
    scale: fitScale,
  });

  // Resolução extra para telas de alta densidade.
  const dpr = window.devicePixelRatio || 1;

  const cssWidth = Math.floor(viewport.width);
  const cssHeight = Math.floor(viewport.height);

  this.#canvas.width = Math.floor(viewport.width * dpr);
  this.#canvas.height = Math.floor(viewport.height * dpr);

  this.#canvas.style.width = `${cssWidth}px`;
  this.#canvas.style.height = `${cssHeight}px`;

  // O wrapper tem exatamente o tamanho da página; o canvas e a camada de
  // texto o preenchem. Sem isso a camada de texto ocuparia o palco inteiro
  // e as palavras apareceriam deslocadas em relação ao que se vê.
  this.#pageContainer.style.width = `${cssWidth}px`;
  this.#pageContainer.style.height = `${cssHeight}px`;

  // O pdf_viewer.css dimensiona fonte e posição da camada de texto com estas
  // variáveis. Se não existirem, as fontes ficam com tamanho errado.
  this.#pageContainer.style.setProperty("--total-scale-factor", String(viewport.scale));
  this.#pageContainer.style.setProperty("--scale-round-x", "1px");
  this.#pageContainer.style.setProperty("--scale-round-y", "1px");

  // Renderiza o Canvas.
  const task = page.render({
    canvasContext: this.#canvas.getContext("2d"),
    viewport,
    transform: dpr !== 1
      ? [dpr, 0, 0, dpr, 0, 0]
      : null,
  });

  this.#task = task;

  try {
    await task.promise;
  } catch (error) {
    if (error?.name !== "RenderingCancelledException") {
      throw error;
    }
  } finally {
    if (this.#task === task) {
      this.#task = null;
    }
  }

  if (token !== this.#renderToken) return;

  // Cria a camada de texto selecionável.
  const textLayer = new pdfjsLib.TextLayer({
    container: this.#textLayerContainer,
    textContentSource: textContent,
    viewport,
  });

  this.#textLayer = textLayer;

  try {
    await textLayer.render();
  } catch (error) {
    if (token !== this.#renderToken) return;
    throw error;
  }

  if (token !== this.#renderToken) return;
}}
