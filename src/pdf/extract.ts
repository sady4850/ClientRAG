import * as pdfjsLib from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
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
    const items = content.items.filter(
      (item): item is TextItem => "str" in item,
    );

    pages.push({ pageNumber, text: joinTextItems(items) });
  }

  return {
    id: createDocumentId(file),
    name: file.name,
    pages,
  };
}

function joinTextItems(items: TextItem[]) {
  let result = "";
  let prev: TextItem | null = null;

  for (const item of items) {
    if (!item.str) {
      if (item.hasEOL && result && !/\s$/.test(result)) {
        result += " ";
      }
      continue;
    }

    if (!prev) {
      result += item.str;
      prev = item;
      continue;
    }

    const prevY = prev.transform[5];
    const curY = item.transform[5];
    const sameLine = Math.abs(curY - prevY) < Math.max(prev.height, item.height) * 0.5;

    if (!sameLine || prev.hasEOL) {
      if (!/\s$/.test(result) && !/^\s/.test(item.str)) {
        result += " ";
      }
      result += item.str;
      prev = item;
      continue;
    }

    const prevEnd = prev.transform[4] + prev.width;
    const gap = item.transform[4] - prevEnd;
    const avgChar = prev.width / Math.max(prev.str.length, 1);
    const needsSpace = gap > avgChar * 0.3 && !/\s$/.test(result) && !/^\s/.test(item.str);

    if (needsSpace) {
      result += " ";
    }
    result += item.str;
    prev = item;
  }

  return result.replace(/[ \t]+/g, " ").trim();
}

export function createDocumentId(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}
