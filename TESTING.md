# Testes

## Instalação (uma vez)

```bash
npm install express pdfjs-dist
npm install -D @playwright/test
npx playwright install chromium
```

Adicione ao `package.json`:

```json
"scripts": {
  "start": "node server/server.js",
  "test": "npm run test:unit && npm run test:e2e",
  "test:unit": "node --test \"tests/unit/*.test.mjs\"",
  "test:e2e": "playwright test"
}
```

## O que existe

- `tests/unit/` — lógica pura, com `node:test`, sem dependências:
  - `reader-math.test.mjs`: limite de página, escala de ajuste, zonas de borda
  - `sentence.test.mjs`: frase de contexto de uma seleção (abreviações, iniciais, trechos longos)
  - `card.test.mjs`: frente/verso do cartão, payload do compartilhamento, arquivo de importação
- `tests/e2e/` — Chromium real + servidor real (Playwright):
  - `storage.spec.js`: IndexedDB (`saveBook`, `getBook`, `getAllBooks`, `updateCurrentPage`)
  - `library.spec.js`: importar, listar, abrir, voltar, erros
  - `reader.spec.js`: navegação, bordas, progresso, ajuste à tela, sem rolagem, resize, alta densidade
  - `rapid-navigation.spec.js`: trocas de página simultâneas (renderização duplicada)
  - `server.spec.js`: arquivos servidos e MIME de JavaScript
  - `text-selection.spec.js`: camada de texto alinhada à página; seleção por duplo clique e arraste
  - `anki-card.spec.js`: painel do cartão (frente, frase, verso), envio por compartilhamento e arquivo `.txt`
  - `tablet.spec.js`: emulação de Galaxy Tab (toque, rotação). Não substitui teste no aparelho real.

Regra: toda mudança nova vem com teste; rode `npm test` antes de seguir para a próxima etapa.

## O que os testes do Anki NÃO garantem

- O Web Share é simulado (`navigator.share` falso): o teste confere o que seria enviado
  (`title` → frente, `text` → verso), não o que o AnkiDroid faz ao receber.
- Validar no Galaxy Tab, com o app servido por HTTPS: a lista de compartilhamento aparece,
  o AnkiDroid está nela e a frente/verso chegam nos campos certos.
- A importação do arquivo `.txt` no AnkiDroid também precisa ser conferida no aparelho.
