import { TransformersEmbedder } from "../embeddings/embedder";
import { createDocumentId, extractPdfText } from "../pdf/extract";
import { IndexedDbVectorStore } from "../vector-store/indexedDbStore";
import { MemoryVectorStore } from "../vector-store/memoryStore";
import type {
  DocumentSummary,
  ExtractedDocument,
  SearchResult,
  TextChunk,
  VectorRecord,
} from "../types";
import { chunkDocument, type ChunkDocumentOptions } from "./chunking";

export type VectorStore = {
  upsert(records: VectorRecord[]): Promise<void>;
  search(input: {
    collectionId: string;
    embedding: number[];
    topK: number;
  }): Promise<SearchResult[]>;
  deleteDocument(collectionId: string, documentId: string): Promise<void>;
  clearCollection(collectionId: string): Promise<void>;
  listDocuments(collectionId: string): Promise<DocumentSummary[]>;
  saveDocumentSource(document: ExtractedDocument): Promise<void>;
  getDocumentSource(documentId: string): Promise<ExtractedDocument | undefined>;
};

export type ClientRagOptions = {
  model?: string;
  storage?: "indexeddb" | "memory";
  store?: VectorStore;
  chunking?: ChunkDocumentOptions;
};

export type IndexProgress =
  | { phase: "extracting"; documentName: string }
  | { phase: "loading-model"; loaded: number; total: number }
  | { phase: "embedding"; embedded: number; total: number }
  | { phase: "storing" }
  | { phase: "done"; chunks: number };

export type RechunkProgress =
  | { phase: "loading-model"; loaded: number; total: number }
  | { phase: "document"; documentName: string; index: number; total: number }
  | { phase: "embedding"; embedded: number; total: number; documentName: string }
  | { phase: "done"; processed: number; skipped: number };

export type IndexInput = {
  file: File;
  collectionId?: string;
  reindex?: boolean;
  onProgress?: (event: IndexProgress) => void;
};

export type SearchInput = {
  query: string;
  collectionId?: string;
  topK?: number;
};

export type IndexResult =
  | { skipped: false; document: ExtractedDocument; chunks: TextChunk[] }
  | { skipped: true; documentId: string };

const DEFAULT_COLLECTION = "default";
const EMBED_BATCH_SIZE = 16;

export class ClientRAG {
  private readonly embedder: TransformersEmbedder;
  private readonly store: VectorStore;
  private readonly chunkOptions: ChunkDocumentOptions;

  constructor(options: ClientRagOptions = {}) {
    this.embedder = new TransformersEmbedder({ model: options.model });
    this.store =
      options.store ??
      (options.storage === "memory"
        ? new MemoryVectorStore()
        : new IndexedDbVectorStore());
    this.chunkOptions = options.chunking ?? {};
  }

  async index(input: IndexInput): Promise<IndexResult> {
    const collectionId = input.collectionId ?? DEFAULT_COLLECTION;
    const notify = input.onProgress ?? (() => {});

    if (!input.reindex) {
      const documentId = createDocumentId(input.file);
      if (await this.hasDocument(documentId, collectionId)) {
        notify({ phase: "done", chunks: 0 });
        return { skipped: true, documentId };
      }
    }

    notify({ phase: "extracting", documentName: input.file.name });
    const document = await extractPdfText(input.file);
    const chunks = chunkDocument(document, this.chunkOptions);

    if (chunks.length === 0) {
      notify({ phase: "done", chunks: 0 });
      return { skipped: false, document, chunks };
    }

    await this.embedder.load({
      onProgress: (event) => {
        const e = event as { status?: string; loaded?: number; total?: number };
        if (e?.status === "progress") {
          notify({
            phase: "loading-model",
            loaded: e.loaded ?? 0,
            total: e.total ?? 0,
          });
        }
      },
    });

    const total = chunks.length;
    let embedded = 0;
    const records: VectorRecord[] = [];

    for (let offset = 0; offset < chunks.length; offset += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(offset, offset + EMBED_BATCH_SIZE);
      const embeddings = await this.embedder.embed(batch.map((c) => c.text));

      for (let i = 0; i < batch.length; i += 1) {
        records.push({
          id: `${collectionId}:${batch[i].id}`,
          collectionId,
          documentId: document.id,
          chunk: batch[i],
          embedding: embeddings[i],
        });
      }

      embedded += batch.length;
      notify({ phase: "embedding", embedded, total });
    }

    notify({ phase: "storing" });
    await this.store.saveDocumentSource(document);
    await this.store.upsert(records);
    notify({ phase: "done", chunks: records.length });

    return { skipped: false, document, chunks };
  }

  async rechunkAll(
    options: {
      collectionId?: string;
      onProgress?: (event: RechunkProgress) => void;
    } = {},
  ): Promise<{ processed: number; skipped: number }> {
    const collectionId = options.collectionId ?? DEFAULT_COLLECTION;
    const notify = options.onProgress ?? (() => {});

    const docs = await this.store.listDocuments(collectionId);
    if (docs.length === 0) {
      notify({ phase: "done", processed: 0, skipped: 0 });
      return { processed: 0, skipped: 0 };
    }

    await this.embedder.load({
      onProgress: (event) => {
        const e = event as { status?: string; loaded?: number; total?: number };
        if (e?.status === "progress") {
          notify({
            phase: "loading-model",
            loaded: e.loaded ?? 0,
            total: e.total ?? 0,
          });
        }
      },
    });

    let processed = 0;
    let skipped = 0;

    for (let i = 0; i < docs.length; i += 1) {
      const summary = docs[i];
      const source = await this.store.getDocumentSource(summary.documentId);
      if (!source) {
        skipped += 1;
        continue;
      }

      notify({
        phase: "document",
        documentName: summary.documentName,
        index: i,
        total: docs.length,
      });

      const chunks = chunkDocument(source, this.chunkOptions);
      await this.store.deleteDocument(collectionId, summary.documentId);
      await this.store.saveDocumentSource(source);

      if (chunks.length === 0) {
        processed += 1;
        continue;
      }

      const records: VectorRecord[] = [];
      let embedded = 0;

      for (let offset = 0; offset < chunks.length; offset += EMBED_BATCH_SIZE) {
        const batch = chunks.slice(offset, offset + EMBED_BATCH_SIZE);
        const embeddings = await this.embedder.embed(batch.map((c) => c.text));

        for (let j = 0; j < batch.length; j += 1) {
          records.push({
            id: `${collectionId}:${batch[j].id}`,
            collectionId,
            documentId: source.id,
            chunk: batch[j],
            embedding: embeddings[j],
          });
        }

        embedded += batch.length;
        notify({
          phase: "embedding",
          embedded,
          total: chunks.length,
          documentName: summary.documentName,
        });
      }

      await this.store.upsert(records);
      processed += 1;
    }

    notify({ phase: "done", processed, skipped });
    return { processed, skipped };
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const query = input.query.trim();
    if (!query) {
      return [];
    }

    await this.embedder.load();
    const [embedding] = await this.embedder.embed([query]);

    return this.store.search({
      collectionId: input.collectionId ?? DEFAULT_COLLECTION,
      embedding,
      topK: input.topK ?? 6,
    });
  }

  async listDocuments(collectionId: string = DEFAULT_COLLECTION) {
    return this.store.listDocuments(collectionId);
  }

  async hasDocument(documentId: string, collectionId: string = DEFAULT_COLLECTION) {
    const docs = await this.store.listDocuments(collectionId);
    return docs.some((doc) => doc.documentId === documentId);
  }

  async clear(collectionId: string = DEFAULT_COLLECTION) {
    await this.store.clearCollection(collectionId);
  }

  async deleteDocument(documentId: string, collectionId: string = DEFAULT_COLLECTION) {
    await this.store.deleteDocument(collectionId, documentId);
  }
}
