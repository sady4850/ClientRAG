import type { ExtractedDocument, TextChunk } from "../types";

export type ChunkDocumentOptions = {
  targetSize?: number;
  overlap?: number;
  minSize?: number;
};

const DEFAULT_TARGET_SIZE = 900;
const DEFAULT_OVERLAP = 150;
const DEFAULT_MIN_SIZE = 20;

export function chunkDocument(
  document: ExtractedDocument,
  options: ChunkDocumentOptions = {},
): TextChunk[] {
  const targetSize = options.targetSize ?? DEFAULT_TARGET_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;
  const minSize = options.minSize ?? DEFAULT_MIN_SIZE;

  if (overlap >= targetSize) {
    throw new Error("Chunk overlap must be smaller than target size.");
  }

  const chunks: TextChunk[] = [];

  for (const page of document.pages) {
    const text = normalizeText(page.text);
    if (text.length < minSize) {
      continue;
    }

    let start = 0;
    let index = 0;

    while (start < text.length) {
      const end = findChunkEnd(text, start, targetSize);
      const chunkText = text.slice(start, end).trim();

      if (chunkText.length >= minSize) {
        chunks.push({
          id: `${document.id}:p${page.pageNumber}:c${index}`,
          documentId: document.id,
          documentName: document.name,
          pageNumber: page.pageNumber,
          text: chunkText,
          startOffset: start,
          endOffset: end,
        });
      }

      if (end >= text.length) {
        break;
      }

      start = Math.max(end - overlap, start + 1);
      index += 1;
    }
  }

  return chunks;
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function findChunkEnd(text: string, start: number, targetSize: number) {
  const hardEnd = Math.min(start + targetSize, text.length);
  if (hardEnd === text.length) {
    return hardEnd;
  }

  const sentenceEnd = text.lastIndexOf(".", hardEnd);
  if (sentenceEnd > start + targetSize * 0.6) {
    return sentenceEnd + 1;
  }

  const spaceEnd = text.lastIndexOf(" ", hardEnd);
  if (spaceEnd > start + targetSize * 0.6) {
    return spaceEnd;
  }

  return hardEnd;
}
