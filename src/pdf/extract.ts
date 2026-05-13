import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { ExtractedDocument } from "../types";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdfText(file: File): Promise<ExtractedDocument> {
  if (file.type && file.type !== "application/pdf") {
    throw new Error("Please choose a PDF file.");
  }

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    pages.push({ pageNumber, text });
  }

  return {
    id: createDocumentId(file),
    name: file.name,
    pages,
  };
}

function createDocumentId(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}
