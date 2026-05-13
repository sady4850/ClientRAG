import { describe, expect, it } from "vitest";
import { cosineSimilarity, rankByCosine } from "./search";
import type { VectorRecord } from "../types";

describe("cosineSimilarity", () => {
  it("scores identical vectors above unrelated vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });
});

describe("rankByCosine", () => {
  it("returns top results by descending score", () => {
    const records: VectorRecord[] = [
      record("low", [0, 1]),
      record("high", [1, 0]),
      record("mid", [0.5, 0.5]),
    ];

    const results = rankByCosine(records, [1, 0], 2);

    expect(results.map((result) => result.chunk.id)).toEqual(["high", "mid"]);
  });
});

function record(id: string, embedding: number[]): VectorRecord {
  return {
    id,
    collectionId: "default",
    documentId: "doc-1",
    embedding,
    chunk: {
      id,
      documentId: "doc-1",
      documentName: "sample.pdf",
      pageNumber: 1,
      text: id,
    },
  };
}
