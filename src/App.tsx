import { useMemo, useState } from "react";
import { chunkDocument } from "./core/chunking";
import { extractPdfText } from "./pdf/extract";
import type { ExtractedDocument, TextChunk } from "./types";

type AppState = "empty" | "extracting" | "ready" | "error";

export function App() {
  const [state, setState] = useState<AppState>("empty");
  const [document, setDocument] = useState<ExtractedDocument | null>(null);
  const [chunks, setChunks] = useState<TextChunk[]>([]);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    if (!document) {
      return null;
    }

    return {
      pages: document.pages.length,
      chunks: chunks.length,
      characters: document.pages.reduce((total, page) => total + page.text.length, 0),
    };
  }, [chunks.length, document]);

  async function handleFile(file: File) {
    setState("extracting");
    setError(null);

    try {
      const extracted = await extractPdfText(file);
      const nextChunks = chunkDocument(extracted);
      setDocument(extracted);
      setChunks(nextChunks);
      setState("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to read the PDF.");
      setState("error");
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <div className="header-row">
          <div>
            <h1>ClientRAG</h1>
            <p>Private browser semantic search for PDFs.</p>
          </div>
          <span className="status-pill">{state}</span>
        </div>

        <label
          className="drop-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files.item(0);
            if (file) {
              void handleFile(file);
            }
          }}
        >
          <input
            type="file"
            accept="application/pdf"
            onChange={(event) => {
              const file = event.target.files?.item(0);
              if (file) {
                void handleFile(file);
              }
            }}
          />
          <strong>Drop a PDF or choose a file</strong>
          <span>Text extraction runs in this browser.</span>
        </label>

        {state === "extracting" && <p className="notice">Extracting PDF text...</p>}
        {error && <p className="error">{error}</p>}

        {summary && document && (
          <section className="document-panel">
            <div>
              <h2>{document.name}</h2>
              <p>
                {summary.pages} pages, {summary.chunks} chunks, {summary.characters} characters
              </p>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
