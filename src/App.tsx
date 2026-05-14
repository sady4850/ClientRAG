import { useEffect, useRef, useState } from "react";
import type { ClientRAG, IndexProgress, RechunkProgress } from "./core/clientrag";
import {
  DEFAULT_SETTINGS,
  MODEL_PRESETS,
  loadSettings,
  saveSettings,
  type Settings,
} from "./settings";
import type { DocumentSummary, SearchResult } from "./types";

type AppState =
  | "empty"
  | "loading"
  | "extracting"
  | "loading-model"
  | "indexing"
  | "rechunking"
  | "ready"
  | "searching"
  | "error";

type ModelProgress = { loaded: number };

function formatResult(result: SearchResult) {
  return `${result.chunk.documentName} — page ${result.chunk.pageNumber} (score ${result.score.toFixed(3)})\n\n${result.chunk.text}`;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" className="link-button copy-button" onClick={handleCopy}>
      {copied ? "Copied" : label}
    </button>
  );
}

function ProgressBar({ fraction }: { fraction: number }) {
  const value = Math.max(0, Math.min(1, fraction));
  return (
    <div className="progress-track" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-fill" style={{ width: `${value * 100}%` }} />
    </div>
  );
}

export function App() {
  const ragRef = useRef<ClientRAG | null>(null);
  const ragKeyRef = useRef<string>("");
  const [state, setState] = useState<AppState>("loading");
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modelProgress, setModelProgress] = useState<ModelProgress | null>(null);
  const [embedProgress, setEmbedProgress] = useState<{ done: number; total: number } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [didSearch, setDidSearch] = useState(false);
  const [lastQuery, setLastQuery] = useState("");
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [rechunkInfo, setRechunkInfo] = useState<{
    documentName: string;
    docIndex: number;
    docTotal: number;
    embedded?: number;
    chunkTotal?: number;
  } | null>(null);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rag = await getRag();
        const docs = await rag.listDocuments();
        if (!cancelled) {
          setDocuments(docs);
          setState(docs.length > 0 ? "ready" : "empty");
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Failed to load stored index.");
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function getRag() {
    const key = `${settings.model}|${settings.targetSize}|${settings.overlap}`;
    if (!ragRef.current || ragKeyRef.current !== key) {
      ragRef.current?.terminate();
      const { ClientRAG } = await import("./core/clientrag");
      ragRef.current = new ClientRAG({
        storage: "indexeddb",
        model: settings.model,
        chunking: {
          targetSize: settings.targetSize,
          overlap: settings.overlap,
        },
      });
      ragKeyRef.current = key;
    }
    return ragRef.current;
  }

  async function refreshDocuments() {
    const rag = await getRag();
    setDocuments(await rag.listDocuments());
  }

  function handleProgress(event: IndexProgress) {
    switch (event.phase) {
      case "extracting":
        setState("extracting");
        break;
      case "loading-model":
        setState("loading-model");
        setModelProgress({ loaded: event.loaded });
        break;
      case "embedding":
        setState("indexing");
        setEmbedProgress({ done: event.embedded, total: event.total });
        break;
      case "storing":
        setState("indexing");
        break;
      case "done":
        setEmbedProgress(null);
        setModelProgress(null);
        break;
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setResults([]);
    setDidSearch(false);
    setEmbedProgress(null);
    setModelProgress(null);

    try {
      const rag = await getRag();
      await rag.index({ file, reindex: settings.reindex, onProgress: handleProgress });
      await refreshDocuments();
      setState("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to index the PDF.");
      setState("error");
    }
  }

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim() || documents.length === 0) {
      return;
    }

    setError(null);
    setState("searching");
    setDidSearch(true);

    try {
      const rag = await getRag();
      const next = await rag.search({ query, topK: settings.topK });
      setResults(next);
      setLastQuery(query.trim());
      setState("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Search failed.");
      setState("error");
    }
  }

  async function handleDelete(documentId: string) {
    try {
      const rag = await getRag();
      await rag.deleteDocument(documentId);
      await refreshDocuments();
      setResults([]);
      setDidSearch(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed.");
    }
  }

  async function handleRechunk() {
    setError(null);
    setResults([]);
    setDidSearch(false);
    setRechunkInfo(null);
    setState("rechunking");

    try {
      const rag = await getRag();
      const result = await rag.rechunkAll({
        onProgress: (event: RechunkProgress) => {
          switch (event.phase) {
            case "loading-model":
              setModelProgress({ loaded: event.loaded });
              break;
            case "document":
              setModelProgress(null);
              setRechunkInfo({
                documentName: event.documentName,
                docIndex: event.index,
                docTotal: event.total,
              });
              break;
            case "embedding":
              setRechunkInfo((prev) => ({
                documentName: event.documentName,
                docIndex: prev?.docIndex ?? 0,
                docTotal: prev?.docTotal ?? 1,
                embedded: event.embedded,
                chunkTotal: event.total,
              }));
              break;
            case "done":
              setRechunkInfo(null);
              setModelProgress(null);
              break;
          }
        },
      });
      await refreshDocuments();
      setState("ready");
      if (result.processed === 0 && result.skipped > 0) {
        setError(
          `Skipped ${result.skipped} document(s): no stored source pages. Re-drop the PDF with “Force reindex” enabled to make Rechunk work without the file.`,
        );
      }
    } catch (cause) {
      console.error("Rechunk failed", cause);
      setError(cause instanceof Error ? cause.message : "Rechunk failed.");
      setRechunkInfo(null);
      setModelProgress(null);
      setState("error");
    }
  }

  async function handleClearAll() {
    if (!confirm("Remove all indexed documents from this browser?")) {
      return;
    }
    try {
      const rag = await getRag();
      await rag.clear();
      await refreshDocuments();
      setResults([]);
      setDidSearch(false);
      setState("empty");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Clear failed.");
    }
  }

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  const isBusy =
    state === "loading" ||
    state === "extracting" ||
    state === "loading-model" ||
    state === "indexing" ||
    state === "rechunking" ||
    state === "searching";

  const modelChanged = settings.model !== DEFAULT_SETTINGS.model;
  const chunkingChanged =
    settings.targetSize !== DEFAULT_SETTINGS.targetSize ||
    settings.overlap !== DEFAULT_SETTINGS.overlap;
  const willReindexExisting =
    documents.length > 0 && (modelChanged || chunkingChanged) && settings.reindex;

  return (
    <main className="app-shell">
      <section className="workspace">
        <div className="header-row">
          <div>
            <h1>ClientRAG</h1>
            <p>Private browser semantic search for PDFs.</p>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="link-button"
              onClick={() => setShowSettings((v) => !v)}
            >
              {showSettings ? "Hide settings" : "Settings"}
            </button>
            <span className="status-pill">{state}</span>
          </div>
        </div>

        {showSettings && (
          <section className="settings-panel">
            <div className="settings-grid">
              <label className="settings-field">
                <span>Embedding model</span>
                <select
                  value={settings.model}
                  onChange={(event) => update("model", event.target.value)}
                  disabled={isBusy}
                >
                  {MODEL_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                  {!MODEL_PRESETS.some((p) => p.id === settings.model) && (
                    <option value={settings.model}>{settings.model}</option>
                  )}
                </select>
              </label>

              <label className="settings-field">
                <span>Chunk size (chars)</span>
                <input
                  type="number"
                  min={200}
                  max={4000}
                  step={50}
                  value={settings.targetSize}
                  onChange={(event) =>
                    update("targetSize", Math.max(200, Number(event.target.value) || 0))
                  }
                  disabled={isBusy}
                />
              </label>

              <label className="settings-field">
                <span>Overlap (chars)</span>
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, settings.targetSize - 50)}
                  step={10}
                  value={settings.overlap}
                  onChange={(event) =>
                    update("overlap", Math.max(0, Number(event.target.value) || 0))
                  }
                  disabled={isBusy}
                />
              </label>

              <label className="settings-field">
                <span>Top K results</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={settings.topK}
                  onChange={(event) =>
                    update("topK", Math.max(1, Number(event.target.value) || 1))
                  }
                  disabled={isBusy}
                />
              </label>

              <label className="settings-field settings-checkbox">
                <input
                  type="checkbox"
                  checked={settings.reindex}
                  onChange={(event) => update("reindex", event.target.checked)}
                  disabled={isBusy}
                />
                <span>Force reindex on next drop</span>
              </label>
            </div>

            <div className="settings-actions">
              <button
                type="button"
                className="link-button"
                onClick={() => void handleRechunk()}
                disabled={isBusy || documents.length === 0}
                title="Rebuild chunks and embeddings for all indexed documents using current settings"
              >
                Rechunk &amp; re-embed all
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => setSettings({ ...DEFAULT_SETTINGS })}
                disabled={isBusy}
              >
                Reset to defaults
              </button>
            </div>

            {documents.length > 0 && (modelChanged || chunkingChanged) && (
              <p className="notice subtle">
                Existing documents still use previous model/chunking. Click “Rechunk &amp; re-embed
                all” to rebuild them in place, or enable “Force reindex” and drop the file again.
              </p>
            )}
          </section>
        )}

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
            disabled={isBusy}
            onChange={(event) => {
              const file = event.target.files?.item(0);
              if (file) {
                void handleFile(file);
              }
            }}
          />
          <strong>Drop a PDF or choose a file</strong>
          <span>Text extraction and embeddings run in this browser.</span>
        </label>

        {state === "extracting" && <p className="notice">Extracting PDF text…</p>}
        {(state === "loading-model" || (state === "rechunking" && modelProgress)) && (
          <div className="notice">
            <div className="progress-label">
              Loading embedding model
              {modelProgress && modelProgress.loaded > 0
                ? ` · ${(modelProgress.loaded / (1024 * 1024)).toFixed(1)} MB`
                : ""}
            </div>
            <div className="progress-track" role="progressbar" aria-busy="true">
              <div className="progress-fill progress-fill--indeterminate" />
            </div>
          </div>
        )}
        {state === "indexing" && (
          <div className="notice">
            <div className="progress-label">
              Indexing chunks
              {embedProgress ? ` · ${embedProgress.done}/${embedProgress.total}` : ""}
            </div>
            {embedProgress && embedProgress.total > 0 && (
              <ProgressBar fraction={embedProgress.done / embedProgress.total} />
            )}
          </div>
        )}
        {state === "rechunking" && rechunkInfo && (
          <div className="notice">
            <div className="progress-label">
              Re-embedding {rechunkInfo.documentName} ({rechunkInfo.docIndex + 1}/
              {rechunkInfo.docTotal})
              {rechunkInfo.chunkTotal
                ? ` · ${rechunkInfo.embedded ?? 0}/${rechunkInfo.chunkTotal} chunks`
                : ""}
            </div>
            <ProgressBar
              fraction={
                (rechunkInfo.docIndex +
                  (rechunkInfo.chunkTotal
                    ? (rechunkInfo.embedded ?? 0) / rechunkInfo.chunkTotal
                    : 0)) /
                rechunkInfo.docTotal
              }
            />
          </div>
        )}
        {state === "rechunking" && !rechunkInfo && <p className="notice">Re-embedding…</p>}
        {error && <p className="error">{error}</p>}

        {documents.length > 0 && (
          <section className="document-panel">
            <header className="document-panel-header">
              <h2>Indexed documents ({documents.length})</h2>
              <button type="button" className="link-button" onClick={handleClearAll} disabled={isBusy}>
                Clear all
              </button>
            </header>
            <ul className="document-list">
              {documents.map((doc) => (
                <li key={doc.documentId}>
                  <div>
                    <strong>{doc.documentName}</strong>
                    <span className="meta">
                      {doc.pageCount} pages · {doc.chunkCount} chunks
                    </span>
                  </div>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => void handleDelete(doc.documentId)}
                    disabled={isBusy}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {documents.length > 0 && (
          <form className="search-row" onSubmit={handleSearch}>
            <input
              type="search"
              placeholder="Semantic query, e.g. termination clause"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={isBusy}
            />
            <button type="submit" disabled={isBusy || !query.trim()}>
              {state === "searching" ? "Searching…" : "Search"}
            </button>
          </form>
        )}

        {results.length > 0 && (
          <section className="results">
            <div className="results-header">
              <div className="results-summary">
                {lastQuery && <strong className="query-echo">“{lastQuery}”</strong>}
                <span className="meta">
                  {results.length} result{results.length === 1 ? "" : "s"}
                </span>
              </div>
              <CopyButton
                label="Copy all"
                value={
                  (lastQuery ? `Query: ${lastQuery}\n\n` : "") +
                  results.map((r) => formatResult(r)).join("\n\n---\n\n")
                }
              />
            </div>
            {results.map((result) => (
              <article key={result.chunk.id} className="result-card">
                <header>
                  <h3>{result.chunk.documentName}</h3>
                  <div className="card-actions">
                    <span className="meta">
                      page {result.chunk.pageNumber} · score {result.score.toFixed(3)}
                    </span>
                    <CopyButton label="Copy" value={formatResult(result)} />
                  </div>
                </header>
                <p>{result.chunk.text}</p>
              </article>
            ))}
          </section>
        )}

        {didSearch && state === "ready" && results.length === 0 && (
          <p className="notice">No results.</p>
        )}
      </section>
    </main>
  );
}
