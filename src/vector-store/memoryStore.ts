import { rankByCosine } from "../core/search";
import type { SearchResult, VectorRecord } from "../types";

export class MemoryVectorStore {
  private records = new Map<string, VectorRecord>();

  async upsert(records: VectorRecord[]) {
    for (const record of records) {
      this.records.set(record.id, record);
    }
  }

  async search(input: {
    collectionId: string;
    embedding: number[];
    topK: number;
  }): Promise<SearchResult[]> {
    const records = [...this.records.values()].filter(
      (record) => record.collectionId === input.collectionId,
    );

    return rankByCosine(records, input.embedding, input.topK);
  }

  async deleteDocument(collectionId: string, documentId: string) {
    for (const record of this.records.values()) {
      if (record.collectionId === collectionId && record.documentId === documentId) {
        this.records.delete(record.id);
      }
    }
  }

  async clearCollection(collectionId: string) {
    for (const record of this.records.values()) {
      if (record.collectionId === collectionId) {
        this.records.delete(record.id);
      }
    }
  }
}
