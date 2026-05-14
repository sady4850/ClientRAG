# ClientRAG

Private, browser-only semantic search for PDFs.

**[Live demo →](https://sady4850.github.io/ClientRAG/)**

ClientRAG runs PDF text extraction, embedding, and vector search entirely in the browser. Your documents never leave the page — there is no backend and no upload.

> **About the name.** ClientRAG covers the **retrieval** side of RAG: chunking, embeddings, semantic search over your own documents. There is no generation/LLM step in the app today, and adding one is **not on the immediate roadmap** — see [Generation](#generation-not-included) below. The plumbing (`SearchResult[]`) is shaped so a generator adapter can be layered on later without touching the core.

## Privacy model

- PDFs are read locally via `pdf.js`. No bytes are sent to a server.
- Embeddings are generated locally via [Transformers.js] using `Xenova/paraphrase-multilingual-MiniLM-L12-v2` by default.
- Vectors are stored in your browser's IndexedDB.
- The only network traffic is the **first-time download** of the embedding model and ONNX Runtime wasm assets from a CDN (or your hosted copy). After that, the browser caches them.
- There is no analytics, telemetry, or document upload of any kind.

## Generation (not included)

The "G" in RAG — sending retrieved chunks to an LLM to synthesize an answer — is deliberately absent. The reason is the trade-off for a public demo:

- A hosted LLM (OpenAI/Anthropic/etc.) needs an API key. Putting a key field in a public web app means each visitor has to paste their own key into the browser, which is a poor UX and a real security risk (XSS, malicious extensions, copy-pasted into the wrong tab).
- A local browser LLM (WebLLM/WebGPU) means another 1-4 GB download and uneven hardware support.
- A self-hosted endpoint defeats the "no backend" property of this project.

If you want generation on top, the public API (`rag.search({ query, topK })` returns `SearchResult[]` with `chunk.text`, page, score) is designed to plug into any generator: just feed the snippets to your own LLM call. The repo does not provide that adapter.

## What it does today

1. Drop a PDF.
2. The app extracts text in the browser.
3. Pages are chunked with page metadata preserved.
4. Each chunk is embedded with a local transformer model.
5. Vectors are written to IndexedDB.
6. You type a semantic query; the app returns top-K ranked snippets with document name, page number, and similarity score.
7. Refresh the page — your index is still there. You can delete a document or clear the collection.

## Local development

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm run build    # static output in dist/
npm test -- --run
```

The first time you index a PDF the browser will download the embedding model (~50 MB) and the ONNX wasm runtime. Subsequent loads are cached.

## Deployment (GitHub Pages)

`npm run build` produces fully static assets in `dist/` suitable for GitHub Pages or any static host. GitHub Pages serves the page — it never receives PDFs.

This repo ships a GitHub Actions workflow at `.github/workflows/deploy-pages.yml` that builds and publishes `dist/` to Pages on every push to `main`. To enable it:

1. In the repo settings: **Pages → Build and deployment → Source → GitHub Actions**.
2. Push to `main` (or trigger the workflow manually).

Vite is configured with `base: "./"`, so the build works under any repo subpath (e.g. `https://<user>.github.io/ClientRAG/`) without further config. The pdf.js worker and Transformers.js wasm/model assets are loaded through hashed relative URLs and resolve correctly under a subpath.

## Architecture

- `src/pdf/` — `pdf.js` wrapper, page-aware text extraction.
- `src/core/chunking.ts` — deterministic page-aware chunking with overlap.
- `src/core/search.ts` — cosine similarity ranking with stable tie-breaking.
- `src/embeddings/` — Transformers.js wrapper, lazy-loaded via dynamic import.
- `src/vector-store/` — `MemoryVectorStore` (tests/debug) and `IndexedDbVectorStore` (default).
- `src/core/clientrag.ts` — framework-agnostic facade: `index`, `search`, `listDocuments`, `deleteDocument`, `clear`.
- `src/App.tsx` — minimal React demo around the facade.

## Public API sketch

```ts
import { ClientRAG } from "./core/clientrag";

const rag = new ClientRAG({ storage: "indexeddb" });

await rag.index({ file, onProgress: (event) => console.log(event) });

const results = await rag.search({ query: "termination clause", topK: 6 });
```

Results contain `{ chunk: { documentName, pageNumber, text, ... }, score }`.

## Roadmap

- Code-splitting and progress UX for first-use model download (done).
- Persistence controls — restore on refresh, delete/clear (done).
- GitHub Pages workflow (done).
- Optional: multi-file drop, score threshold, snippet expand, snapshot/export of the indexed collection.
- Optional: table-aware extraction, mojibake replacement table, OCR fallback for image-only PDFs.

## Non-goals

- No backend.
- No account system or multi-user sync.
- No bundled LLM / generation step (see [Generation](#generation-not-included)).
- No committed API keys or large model binaries.

[Transformers.js]: https://github.com/huggingface/transformers.js
