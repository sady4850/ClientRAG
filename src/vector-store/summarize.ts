import type { DocumentSummary, VectorRecord } from "../types";

export function summarizeDocuments(records: VectorRecord[]): DocumentSummary[] {
  const byDoc = new Map<string, { name: string; chunks: number; pages: Set<number> }>();

  for (const record of records) {
    const existing = byDoc.get(record.documentId);
    if (existing) {
      existing.chunks += 1;
      existing.pages.add(record.chunk.pageNumber);
    } else {
      byDoc.set(record.documentId, {
        name: record.chunk.documentName,
        chunks: 1,
        pages: new Set([record.chunk.pageNumber]),
      });
    }
  }

  return [...byDoc.entries()]
    .map(([documentId, info]) => ({
      documentId,
      documentName: info.name,
      chunkCount: info.chunks,
      pageCount: info.pages.size,
    }))
    .sort((left, right) => left.documentName.localeCompare(right.documentName));
}
