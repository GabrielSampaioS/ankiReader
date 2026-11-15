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

  constructor({ container, canvas, onPageChange = () => {} }) {
    this.#container = container;
    this.#canvas = canvas;
    this.#onPageChange = onPageChange;
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

    this.#canvas.width = 0;
    this.#canvas.height = 0;
  }

  #clamp(page) {
    return clampPage(page, this.numPages);
  }

  async #render() {
    const token = ++this.#renderToken;

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

    const availableWidth = this.#container.clientWidth;
    const availableHeight = this.#container.clientHeight;
    if (!availableWidth || !availableHeight) return;

    // Escala que faz a página inteira caber, sem rolagem.
    const base = page.getViewport({ scale: 1 });
    const fitScale = computeFitScale({
      availableWidth,
      availableHeight,
      pageWidth: base.width,
      pageHeight: base.height,
    });

    // Resolução extra para telas de alta densidade (Galaxy Tab).
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: fitScale * dpr });

    this.#canvas.width = Math.floor(viewport.width);
    this.#canvas.height = Math.floor(viewport.height);
    this.#canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
    this.#canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;

    const task = page.render({
      canvasContext: this.#canvas.getContext("2d"),
      viewport,
    });
    this.#task = task;

    try {
      await task.promise;
    } catch (error) {
      if (error?.name !== "RenderingCancelledException") throw error;
    } finally {
      if (this.#task === task) this.#task = null;
    }
  }
}
