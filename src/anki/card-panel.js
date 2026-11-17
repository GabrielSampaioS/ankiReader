// Painel "Novo cartão": aparece quando o usuário seleciona texto no leitor,
// deixa digitar o verso e envia ao Anki (compartilhamento do Android ou
// arquivo para importar).

import {
  cleanFront,
  buildCard,
  buildSharePayload,
  buildImportFile,
  buildFileName,
} from "/src/anki/card.mjs";
import { readSelectionContext } from "/src/reader/selection-context.js";

const SELECTION_DEBOUNCE_MS = 150;

export function createCardPanel({ textLayer, isReaderActive }) {
  const $ = (id) => document.getElementById(id);

  const els = {
    panel: $("card-panel"),
    close: $("card-close"),
    front: $("card-front"),
    context: $("card-context"),
    back: $("card-back"),
    includeContext: $("card-include-context"),
    share: $("card-share"),
    download: $("card-download"),
    status: $("card-status"),
    hint: $("card-hint"),
  };

  let context = "";
  let dirty = false;
  let pointerInside = false;
  let debounce = null;

  // ---------- Visibilidade ----------

  function isOpen() {
    return !els.panel.classList.contains("hidden");
  }

  function open(selection) {
    const front = cleanFront(selection.selected);
    const isSameSelection =
      isOpen() && els.front.value === front && context === selection.context;

    if (!isSameSelection) {
      els.front.value = front;
      context = selection.context;
      els.context.textContent = selection.context;
      els.context.hidden = !selection.context;
      els.back.value = "";
      dirty = false;
      setStatus("");
    }

    updateShareAvailability();
    els.panel.classList.remove("hidden");
  }

  function close() {
    els.panel.classList.add("hidden");
    els.front.value = "";
    els.back.value = "";
    els.context.textContent = "";
    context = "";
    dirty = false;
    setStatus("");
  }

  function setStatus(message) {
    els.status.textContent = message;
  }

  // O Web Share só existe em contexto seguro (HTTPS ou localhost).
  function updateShareAvailability() {
    const available = typeof navigator.share === "function";
    els.share.disabled = !available;
    els.hint.hidden = available;
  }

  // ---------- Seleção ----------

  function panelIsBusy() {
    return pointerInside || els.panel.contains(document.activeElement);
  }

  function syncWithSelection() {
    if (!isReaderActive()) return;

    // Tocar no painel (ex.: no campo do verso) tira a seleção da página;
    // isso não pode fechar nem sobrescrever o cartão em edição.
    if (panelIsBusy()) return;

    const selection = readSelectionContext(textLayer);

    if (selection) {
      open(selection);
    } else if (!dirty) {
      close();
    }
  }

  function handleSelectionChange() {
    clearTimeout(debounce);
    debounce = setTimeout(syncWithSelection, SELECTION_DEBOUNCE_MS);
  }

  // ---------- Envio ----------

  function currentCard() {
    return buildCard({
      selected: els.front.value,
      context,
      back: els.back.value,
      includeContext: els.includeContext.checked,
    });
  }

  async function share() {
    const card = currentCard();

    if (!card.front) {
      setStatus("Preencha a frente do cartão.");
      return;
    }

    if (typeof navigator.share !== "function") {
      updateShareAvailability();
      return;
    }

    try {
      await navigator.share(buildSharePayload(card));
      setStatus("Enviado para o compartilhamento.");
    } catch (error) {
      // AbortError: o usuário fechou a lista de apps. Não é erro.
      if (error?.name !== "AbortError") {
        console.error("Erro ao compartilhar cartão:", error);
        setStatus("Não foi possível compartilhar. Use “Baixar arquivo”.");
      }
    }
  }

  function download() {
    const card = currentCard();

    if (!card.front) {
      setStatus("Preencha a frente do cartão.");
      return;
    }

    const blob = new Blob([buildImportFile(card)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = buildFileName(card.front);
    document.body.append(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("Arquivo gerado. No Anki, use Importar arquivo.");
  }

  // ---------- Eventos ----------

  function markDirty() {
    dirty = true;
  }

  els.close.addEventListener("click", close);
  els.share.addEventListener("click", share);
  els.download.addEventListener("click", download);
  els.front.addEventListener("input", markDirty);
  els.back.addEventListener("input", markDirty);

  els.panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  els.panel.addEventListener("pointerdown", () => {
    pointerInside = true;
  });
  const releasePointer = () => {
    pointerInside = false;
  };
  document.addEventListener("pointerup", releasePointer);
  document.addEventListener("pointercancel", releasePointer);

  document.addEventListener("selectionchange", handleSelectionChange);

  return { close, isOpen };
}
