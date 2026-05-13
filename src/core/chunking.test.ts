import { describe, expect, it } from "vitest";
import { chunkDocument } from "./chunking";

describe("chunkDocument", () => {
  it("keeps document and page metadata on chunks", () => {
    const chunks = chunkDocument(
      {
        id: "doc-1",
        name: "sample.pdf",
        pages: [
          {
            pageNumber: 3,
            text: "This page contains enough text to become a searchable chunk.",
          },
        ],
      },
      { targetSize: 40, overlap: 5, minSize: 10 },
    );

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toMatchObject({
      documentId: "doc-1",
      documentName: "sample.pdf",
      pageNumber: 3,
    });
  });

  it("drops empty pages", () => {
    const chunks = chunkDocument({
      id: "doc-1",
      name: "sample.pdf",
      pages: [{ pageNumber: 1, text: "   \n\t   " }],
    });

    expect(chunks).toEqual([]);
  });
});
