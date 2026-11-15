# Anki Reader

> Um leitor de PDF desenvolvido para facilitar o aprendizado de inglês durante a leitura, permitindo consultar palavras, compreender seu contexto e adicionar vocabulário ao Anki sem interromper a experiência de leitura.

## 1. Visão geral do projeto

O Anki Reader tem como objetivo criar uma experiência semelhante à de um e-reader, com recursos adicionais voltados ao aprendizado de idiomas.

A ideia é permitir que o usuário leia um livro em inglês, selecione uma palavra desconhecida e consulte sua definição e tradução. A partir disso, poderá salvar a palavra no Anki juntamente com a frase original em que ela aparece.

O fluxo planejado é:

1. Importar um PDF para a aplicação.
2. Armazenar o documento localmente no navegador.
3. Abrir o livro em um visualizador próprio.
4. Navegar entre páginas sem rolagem vertical.
5. Selecionar palavras utilizando mouse ou S Pen.
6. Identificar a frase que contém a palavra selecionada.
7. Consultar sua definição e tradução.
8. Criar um cartão no Anki com o vocabulário e seu contexto.

O projeto está sendo desenvolvido inicialmente como uma aplicação web, utilizando JavaScript e Node.js.

---

## 2. Arquitetura

Uma das principais decisões do projeto foi separar as responsabilidades entre frontend e backend.

O navegador será responsável pela experiência de leitura e pelo gerenciamento dos documentos. O Node.js ficará responsável pelos serviços que exigem comunicação externa ou processamento no servidor.

### Frontend

Responsabilidades:

- Importação dos PDFs.
- Armazenamento local dos documentos.
- Recuperação dos livros.
- Controle da página atual.
- Renderização das páginas.
- Gerenciamento de cache.
- Seleção e identificação de palavras.
- Interface de leitura.

### Backend

Responsabilidades planejadas:

- Consultas a serviços de dicionário.
- Tradução de palavras e frases.
- Integração com serviços externos.
- Comunicação com o Anki, quando necessária.
- Eventual persistência de dados adicionais.

**Decisão técnica:** não enviar o PDF inteiro ao backend apenas para permitir sua leitura. O documento pertence ao contexto de leitura do usuário e não precisa passar pelo servidor para ser exibido.

---

## 3. Tecnologias e dependências

### Node.js

Ambiente de execução JavaScript utilizado para executar o servidor local.

### Express

Framework HTTP utilizado para criar o servidor e disponibilizar os arquivos estáticos da aplicação.

Inicialmente, o Express também seria responsável por receber e processar PDFs. Essa abordagem foi reconsiderada para manter o processamento da leitura no navegador.

### Multer

Middleware para recebimento de arquivos em aplicações Express.

Foi utilizado na primeira abordagem de upload para receber PDFs. Não é necessário no fluxo atual de armazenamento local.

### pdf-parse

Biblioteca utilizada para extrair texto de arquivos PDF.

Foi considerada inicialmente para recuperar o conteúdo textual dos documentos.

A versão instalada no projeto é a 2.4.5, cuja API utiliza a classe `PDFParse`.

Exemplo:

```javascript
const { PDFParse } = require("pdf-parse");

const parser = new PDFParse({
  data: buffer,
});

const result = await parser.getText();

console.log(result.text);

await parser.destroy();
```

Essa biblioteca poderá ser útil futuramente para extração textual no backend, mas não será a responsável pela renderização visual do leitor.

### PDF.js

Biblioteca da Mozilla para interpretar e renderizar documentos PDF diretamente no navegador.

Será utilizada para:

- Abrir PDFs.
- Consultar quantidade de páginas.
- Renderizar páginas individualmente.
- Recuperar informações textuais.
- Permitir a construção de uma camada de seleção de texto.

Instalação:

```bash
npm install pdfjs-dist
```

A biblioteca utiliza Canvas para desenhar visualmente as páginas.

Posteriormente será utilizada também sua Text Layer, que permite selecionar e interagir com o conteúdo textual.

### IndexedDB

Banco de dados local disponibilizado pelo navegador.

Foi escolhido para armazenar os PDFs e o progresso de leitura.

Diferentemente do `localStorage`, o IndexedDB permite armazenar objetos maiores, como arquivos e Blobs, além de trabalhar de maneira assíncrona.

**Decisão técnica:** utilizar IndexedDB para evitar enviar os documentos ao backend e permitir que os livros continuem disponíveis mesmo depois de fechar o navegador.

---

## 4. Armazenamento dos documentos

O IndexedDB será utilizado como armazenamento principal da biblioteca.

O banco possui as seguintes configurações:

```javascript
const DB_NAME = "anki-reader";
const DB_VERSION = 1;
const STORE_NAME = "books";
```

O banco possui uma Object Store chamada `books`.

Cada livro é representado inicialmente por um objeto:

```javascript
{
  id: "book-001",
  name: "english-book.pdf",
  file: Blob,
  cover
  currentPage: 1,
  createdAt: Date.now()
}
```

### Responsabilidade dos campos

| Campo | Responsabilidade |
|---|---|
| `id` | Identificador único do livro |
| `name` | Nome original do arquivo |
| `file` | Conteúdo binário do PDF |
| `cover` | Primeira página utilizado como capa |
| `currentPage` | Última página visitada |
| `createdAt` | Data de importação |

O campo `file` armazena o próprio arquivo, sem conversão para Base64.

Isso evita aumentar desnecessariamente o tamanho dos documentos e reduz operações de conversão.

### Operações implementadas

O módulo `book-storage.js` concentra as operações de persistência.

**saveBook(file)**

Recebe um arquivo PDF e cria um registro no IndexedDB.

O documento começa com `currentPage = 1`.

**getBook(id)**

Recupera um livro específico pelo identificador.

**getAllBooks()**

Recupera os livros armazenados para apresentar a biblioteca.

**updateCurrentPage(id, page)**

Atualiza a última página lida sem precisar armazenar novamente o PDF.

A separação dessas operações evita que a interface precise conhecer os detalhes internos do IndexedDB.

---

## 5. Estrutura atual do projeto

```text
anki-reader/
│
├── src/
│   └── storage/
│       └── book-storage.js
│
├── public/
│   ├── index.html
│   └── app.js
│
├── server/
│   └── server.js
│
├── package.json
└── node_modules/
```

### Responsabilidades dos arquivos

**src/storage/book-storage.js**

Centraliza a comunicação com o IndexedDB.

**public/index.html**

Contém a estrutura da interface, incluindo o campo de seleção de PDF e a biblioteca.

**public/app.js**

Controla as interações da interface e utiliza as funções do armazenamento local.

**server/server.js**

Será responsável por iniciar o servidor Express e disponibilizar os arquivos estáticos.

---

## 6. Funcionamento do fluxo atual

Atualmente, o fluxo de importação funciona da seguinte maneira:

```text
Usuário seleciona um PDF
        |
        v
Input type="file"
        |
        v
JavaScript recupera o File
        |
        v
saveBook(file)
        |
        v
IndexedDB
        |
        v
Documento armazenado
        |
        v
Biblioteca atualizada
```

O arquivo não é enviado para o Node.js.

A aplicação utiliza `FormData` apenas na abordagem anterior, que foi substituída pelo armazenamento local.

### Persistência da leitura

A atualização do progresso funciona separadamente:

```text
Usuário navega no livro
        |
        v
Página atual é atualizada
        |
        v
updateCurrentPage(id, page)
        |
        v
IndexedDB
        |
        v
Progresso persistido
```

Quando a aplicação é aberta novamente, o livro e sua última página podem ser recuperados.

---

## 7. Decisões técnicas importantes

### 7.1. Processamento local

O PDF não precisa ser enviado ao backend para ser lido.

Isso reduz o tráfego de rede e permite desenvolver uma experiência offline.

### 7.2. IndexedDB em vez de localStorage

O `localStorage` não é apropriado para armazenar documentos PDF grandes.

O IndexedDB oferece suporte a objetos binários e operações assíncronas.

### 7.3. Renderização por página

Não queremos carregar e desenhar todas as páginas simultaneamente.

O objetivo é renderizar somente a página necessária e manter algumas páginas próximas em cache.

Isso reduz o trabalho de renderização e o consumo de memória.

### 7.4. Canvas e Text Layer

O Canvas será responsável pela representação visual do documento.

Entretanto, o Canvas sozinho não permite selecionar palavras.

Por isso, será necessário implementar uma Text Layer sobre a renderização.

Essa camada permitirá relacionar o texto selecionado à sua posição no documento.

### 7.5. Separação de responsabilidades

O armazenamento, a renderização, a navegação e o processamento de vocabulário serão módulos independentes.

Isso permite evoluir cada parte sem concentrar toda a lógica em um único arquivo.

---

## 8. Próximas etapas de desenvolvimento

### Etapa 1 — Armazenamento local

- [x] Criar banco IndexedDB.
- [x] Salvar PDFs.
- [x] Recuperar livros.
- [x] Atualizar página atual.
- [x] Implementar abertura de livros armazenados.
- [x] Recuperar automaticamente o progresso ao abrir um livro.

### Etapa 2 — Leitor PDF

- [x] Integrar PDF.js.
- [x] Renderizar a primeira página.
- [x] Implementar navegação entre páginas.
- [x] Ajustar a página à área disponível da tela.
- [x] Impedir rolagem vertical.
- [x] Implementar navegação pelas extremidades.
- [ ] Testar a experiência no Galaxy Tab.

### Etapa 3 — Desempenho e cache

- [ ] Implementar cache das páginas renderizadas.
- [ ] Pré-renderizar páginas próximas.
- [ ] Liberar recursos de páginas distantes.
- [ ] Evitar renderizações duplicadas.
- [ ] Avaliar consumo de memória.

### Etapa 4 — Seleção de texto

- [ ] Implementar Text Layer.
- [ ] Capturar a palavra selecionada.
- [ ] Identificar a frase correspondente.
- [ ] Recuperar a página e a posição da seleção.

### Etapa 5 — Vocabulário

- [ ] Consultar definições em inglês.
- [ ] Consultar tradução em português.
- [ ] Exibir a frase original.
- [ ] Apresentar uma janela de consulta sem sair do leitor.

### Etapa 6 — Integração com Anki

- [ ] Integrar com AnkiDroid.
- [ ] Criar modelo de cartão.
- [ ] Enviar palavra, definição e frase.
- [ ] Confirmar criação da nota.

---

## 9. Considerações sobre execução offline

Uma das características desejadas é permitir a leitura sem conexão com a internet.

O armazenamento local dos documentos resolve parte desse requisito.

Entretanto, também será necessário:

- Disponibilizar os arquivos JavaScript da aplicação localmente.
- Garantir que o PDF.js e seu Worker estejam disponíveis.
- Considerar um Service Worker para cache dos recursos da aplicação.
- Utilizar APIs externas somente quando houver conexão.

A consulta a dicionários poderá ter cache local. A integração com o AnkiDroid deverá ser avaliada separadamente.

---

## 10. Objetivo técnico do projeto

O objetivo não é apenas construir um visualizador de PDF.

O projeto busca explorar conceitos importantes de desenvolvimento:

- Persistência local com IndexedDB.
- Manipulação de arquivos binários.
- APIs do navegador.
- Renderização gráfica com Canvas.
- Processamento de documentos.
- Gerenciamento de memória.
- Cache e carregamento sob demanda.
- Integração entre aplicações Android.
- Comunicação HTTP.
- Separação de responsabilidades.

A prioridade é construir uma base simples, funcional e bem organizada, evoluindo gradualmente para uma ferramenta de leitura e aprendizado de idiomas.

**Princípio de desenvolvimento:** implementar primeiro o funcionamento essencial, entender as decisões técnicas e somente depois adicionar novas funcionalidades.