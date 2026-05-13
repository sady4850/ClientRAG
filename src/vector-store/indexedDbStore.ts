import { rankByCosine } from "../core/search";
import type { SearchResult, VectorRecord } from "../types";

const DB_NAME = "clientrag";
const DB_VERSION = 1;
const STORE_NAME = "vectors";

export class IndexedDbVectorStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  async upsert(records: VectorRecord[]) {
    const db = await this.open();
    await transaction(db, "readwrite", (store) => {
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

    await transaction(db, "readwrite", (store) => {
      for (const record of records) {
        if (record.documentId === documentId) {
          store.delete(record.id);
        }
      }
    });
  }

  async clearCollection(collectionId: string) {
    const db = await this.open();
    const records = await this.getAllByCollection(collectionId);

    await transaction(db, "readwrite", (store) => {
      for (const record of records) {
        store.delete(record.id);
      }
    });
  }

  private async getAllByCollection(collectionId: string) {
    const db = await this.open();

    return readOnly<VectorRecord[]>(db, (store, resolve, reject) => {
      const request = store.index("collectionId").getAll(collectionId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private open() {
    this.dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("collectionId", "collectionId");
        store.createIndex("documentId", "documentId");
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }
}

function transaction(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    run(tx.objectStore(STORE_NAME));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function readOnly<T>(
  db: IDBDatabase,
  run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
) {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    run(tx.objectStore(STORE_NAME), resolve, reject);
  });
}
