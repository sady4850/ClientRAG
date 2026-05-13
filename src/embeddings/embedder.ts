import { pipeline } from "@huggingface/transformers";
import type { FeatureExtractionPipeline } from "@huggingface/transformers";

export type EmbedderOptions = {
  model?: string;
  onProgress?: (event: unknown) => void;
};

export class TransformersEmbedder {
  private readonly model: string;
  private extractor: FeatureExtractionPipeline | null = null;

  constructor(options: EmbedderOptions = {}) {
    this.model = options.model ?? "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
  }

  async load(options: Pick<EmbedderOptions, "onProgress"> = {}) {
    if (this.extractor) {
      return;
    }

    this.extractor = await pipeline("feature-extraction", this.model, {
      progress_callback: options.onProgress,
    });
  }

  async embed(texts: string[]) {
    await this.load();

    if (!this.extractor) {
      throw new Error("Embedding model did not load.");
    }

    const output = await this.extractor(texts, {
      pooling: "mean",
      normalize: true,
    });

    return output.tolist() as number[][];
  }
}
