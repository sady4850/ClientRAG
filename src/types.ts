export type ExtractedPage = {
  pageNumber: number;
  text: string;
};

export type ExtractedDocument = {
  id: string;
  name: string;
  pages: ExtractedPage[];
};

export type TextChunk = {
  id: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  text: string;
  startOffset?: number;
  endOffset?: number;
};

export type VectorRecord = {
  id: string;
  collectionId: string;
  documentId: string;
  chunk: TextChunk;
  embedding: number[];
};

export type SearchResult = {
  chunk: TextChunk;
  score: number;
};

export type DocumentSummary = {
  documentId: string;
  documentName: string;
  chunkCount: number;
  pageCount: number;
};
