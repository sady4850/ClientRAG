import { describe, expect, it } from "vitest";
import { MemoryVectorStore } from "./memoryStore";
import type { VectorRecord } from "../types";

function record(id: string, embedding: number[], docId = "doc-1", page = 1, collection = "default"): VectorRecord {
  return {
    id,
    collectionId: collection,
    documentId: docId,
    chunk: {
      id,
      documentId: docId,
      documentName: docId,
      pageNumber: page,
      text: `chunk ${id}`,
    },
    embedding,
  };
}

describe("MemoryVectorStore", () => {
  it("upserts records and ranks by cosine on search", async () => {
    const store = new MemoryVectorStore();
    await store.upsert([
      record("a", [1, 0]),
      record("b", [0.9, 0.1]),
      record("c", [0, 1]),
    ]);

    const results = await store.search({
      collectionId: "default",
      embedding: [1, 0],
      topK: 2,
    });

    expect(results.map((r) => r.chunk.id)).toEqual(["a", "b"]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("isolates by collectionId", async () => {
    const store = new MemoryVectorStore();
    await store.upsert([
      record("a", [1, 0], "doc-1", 1, "alpha"),
      record("b", [1, 0], "doc-1", 1, "beta"),
    ]);

    const results = await store.search({
      collectionId: "beta",
      embedding: [1, 0],
      topK: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0].chunk.id).toBe("b");
  });

  it("deletes a single document and clears a collection", async () => {
    const store = new MemoryVectorStore();
    await store.upsert([
      record("a", [1, 0], "doc-1"),
      record("b", [0, 1], "doc-2"),
    ]);

    await store.deleteDocument("default", "doc-1");
    let docs = await store.listDocuments("default");
    expect(docs.map((d) => d.documentId)).toEqual(["doc-2"]);

    await store.clearCollection("default");
    docs = await store.listDocuments("default");
    expect(docs).toEqual([]);
  });

  it("summarizes documents with page and chunk counts", async () => {
    const store = new MemoryVectorStore();
    await store.upsert([
      record("a", [1, 0], "doc-1", 1),
      record("b", [1, 0], "doc-1", 1),
      record("c", [1, 0], "doc-1", 2),
      record("d", [1, 0], "doc-2", 5),
    ]);

    const docs = await store.listDocuments("default");
    expect(docs).toHaveLength(2);
    const doc1 = docs.find((d) => d.documentId === "doc-1")!;
    expect(doc1.chunkCount).toBe(3);
    expect(doc1.pageCount).toBe(2);
    const doc2 = docs.find((d) => d.documentId === "doc-2")!;
    expect(doc2.chunkCount).toBe(1);
    expect(doc2.pageCount).toBe(1);
  });
});
