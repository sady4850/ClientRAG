import type { SearchResult, VectorRecord } from "../types";

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length) {
    throw new Error("Vectors must have the same dimensions.");
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function rankByCosine(records: VectorRecord[], embedding: number[], topK: number): SearchResult[] {
  return records
    .map((record) => ({
      chunk: record.chunk,
      score: cosineSimilarity(record.embedding, embedding),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.chunk.id.localeCompare(right.chunk.id);
    })
    .slice(0, topK);
}
