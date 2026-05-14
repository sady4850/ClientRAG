import { rankByCosine } from "../core/search";
import { summarizeDocuments } from "./summarize";
import type {
  DocumentSummary,
  ExtractedDocument,
  SearchResult,
  VectorRecord,
} from "../types";

const DB_NAME = "clientrag";
const DB_VERSION = 2;
const VECTORS_STORE = "vectors";
const DOCUMENTS_STORE = "documents";

export class IndexedDbVectorStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  async upsert(records: VectorRecord[]) {
    const db = await this.open();
    await runTransaction(db, [VECTORS_STORE], "readwrite", (tx) => {
      const store = tx.objectStore(VECTORS_STORE);
      for (const record of records) {
        store.put(record);
      }
    });
  }

  async search(input: {
    collectionId: string;
    embedding: number[];
    topK: number;
  }): Promise<SearchResult[]> {
    const records = await this.getAllByCollection(input.collectionId);
    return rankByCosine(records, input.embedding, input.topK);
  }

  async deleteDocument(collectionId: string, documentId: string) {
    const db = await this.open();
    const records = await this.getAllByCollection(collectionId);

    await runTransaction(db, [VECTORS_STORE, DOCUMENTS_STORE], "readwrite", (tx) => {
      const vectors = tx.objectStore(VECTORS_STORE);
      for (const record of records) {
        if (record.documentId === documentId) {
          vectors.delete(record.id);
        }
      }
      tx.objectStore(DOCUMENTS_STORE).delete(documentId);
    });
  }

  async listDocuments(collectionId: string): Promise<DocumentSummary[]> {
    const records = await this.getAllByCollection(collectionId);
    return summarizeDocuments(records);
  }

  async clearCollection(collectionId: string) {
    const db = await this.open();
    const records = await this.getAllByCollection(collectionId);
    const documentIds = new Set(records.map((r) => r.documentId));

    await runTransaction(db, [VECTORS_STORE, DOCUMENTS_STORE], "readwrite", (tx) => {
      const vectors = tx.objectStore(VECTORS_STORE);
      for (const record of records) {
        vectors.delete(record.id);
      }
      const documents = tx.objectStore(DOCUMENTS_STORE);
      for (const documentId of documentIds) {
        documents.delete(documentId);
      }
    });
  }

  async saveDocumentSource(document: ExtractedDocument) {
    const db = await this.open();
    await runTransaction(db, [DOCUMENTS_STORE], "readwrite", (tx) => {
      tx.objectStore(DOCUMENTS_STORE).put(document);
    });
  }

  async getDocumentSource(documentId: string): Promise<ExtractedDocument | undefined> {
    const db = await this.open();
    return new Promise<ExtractedDocument | undefined>((resolve, reject) => {
      const tx = db.transaction(DOCUMENTS_STORE, "readonly");
      const request = tx.objectStore(DOCUMENTS_STORE).get(documentId);
      request.onsuccess = () => resolve(request.result as ExtractedDocument | undefined);
      request.onerror = () => reject(request.error);
    });
  }

  private async getAllByCollection(collectionId: string) {
    const db = await this.open();
    return new Promise<VectorRecord[]>((resolve, reject) => {
      const tx = db.transaction(VECTORS_STORE, "readonly");
      const request = tx.objectStore(VECTORS_STORE).index("collectionId").getAll(collectionId);
      request.onsuccess = () => resolve(request.result as VectorRecord[]);
      request.onerror = () => reject(request.error);
    });
  }

  private open() {
    this.dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const oldVersion = event.oldVersion;

        if (oldVersion < 1) {
          const vectors = db.createObjectStore(VECTORS_STORE, { keyPath: "id" });
          vectors.createIndex("collectionId", "collectionId");
          vectors.createIndex("documentId", "documentId");
        }
        if (oldVersion < 2) {
          db.createObjectStore(DOCUMENTS_STORE, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }
}

function runTransaction(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    run(tx);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
