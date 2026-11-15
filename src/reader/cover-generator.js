
import * as pdfjsLib from "/vendor/pdfjs/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "/vendor/pdfjs/pdf.worker.mjs";

export async function generateCover(file) {
  const data = new Uint8Array(await file.arrayBuffer());

  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;

  const canvas = document.createElement("canvas");

  try {
    const page = await pdf.getPage(1);

    // Renderização em resolução reduzida.
    const viewport = page.getViewport({ scale: 0.8 });

    const context = canvas.getContext("2d");

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Não foi possível gerar a capa."));
        },
        "image/jpeg",
        0.75
      );
    });
  } finally {
    canvas.width = 0;
    canvas.height = 0;

    await loadingTask.destroy();
  }
}
