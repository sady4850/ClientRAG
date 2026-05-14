import { rankByCosine } from "../core/search";
import { summarizeDocuments } from "./summarize";
import type {
  DocumentSummary,
  ExtractedDocument,
  SearchResult,
  VectorRecord,
} from "../types";

export class MemoryVectorStore {
  private records = new Map<string, VectorRecord>();
  private sources = new Map<string, ExtractedDocument>();

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
    await this.deleteDocumentVectors(collectionId, documentId);
    this.sources.delete(documentId);
  }

  async deleteDocumentVectors(collectionId: string, documentId: string) {
    for (const record of this.records.values()) {
      if (record.collectionId === collectionId && record.documentId === documentId) {
        this.records.delete(record.id);
      }
    }
  }

  async clearCollection(collectionId: string) {
    const removed = new Set<string>();
    for (const record of this.records.values()) {
      if (record.collectionId === collectionId) {
        removed.add(record.documentId);
        this.records.delete(record.id);
      }
    }
    for (const documentId of removed) {
      this.sources.delete(documentId);
    }
  }

  async listDocuments(collectionId: string): Promise<DocumentSummary[]> {
    const records = [...this.records.values()].filter(
      (record) => record.collectionId === collectionId,
    );
    return summarizeDocuments(records);
  }

  async saveDocumentSource(document: ExtractedDocument) {
    this.sources.set(document.id, document);
  }

  async getDocumentSource(documentId: string): Promise<ExtractedDocument | undefined> {
    return this.sources.get(documentId);
  }
}
