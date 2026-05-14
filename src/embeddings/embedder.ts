export type EmbedderOptions = {
  model?: string;
  onProgress?: (event: unknown) => void;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  onProgress?: (event: unknown) => void;
};

type WorkerMessage =
  | { id: number; type: "loaded" }
  | { id: number; type: "embedded"; embeddings: number[][] }
  | { id: number; type: "progress"; event: unknown }
  | { id: number; type: "error"; message: string };

export class TransformersEmbedder {
  private readonly model: string;
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private loadPromise: Promise<void> | null = null;

  constructor(options: EmbedderOptions = {}) {
    this.model = options.model ?? "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
  }

  async load(options: Pick<EmbedderOptions, "onProgress"> = {}) {
    if (!this.worker) {
      this.worker = new Worker(new URL("./embedder.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.addEventListener("message", (event) => this.onMessage(event));
      this.worker.addEventListener("error", (event) => this.onWorkerError(event));
    }

    if (!this.loadPromise) {
      this.loadPromise = this.call<void>("load", { model: this.model }, options.onProgress);
    }
    await this.loadPromise;
  }

  async embed(texts: string[]) {
    await this.load();
    const result = await this.call<{ embeddings: number[][] }>("embed", { texts });
    return result.embeddings;
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.loadPromise = null;
    for (const pending of this.pending.values()) {
      pending.reject(new Error("Embedder terminated."));
    }
    this.pending.clear();
  }

  private call<T>(
    type: "load" | "embed",
    payload: Record<string, unknown>,
    onProgress?: (event: unknown) => void,
  ): Promise<T> {
    const id = this.nextId++;
    const worker = this.worker;
    if (!worker) {
      return Promise.reject(new Error("Worker is not initialised."));
    }

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        onProgress,
      });
      worker.postMessage({ id, type, ...payload });
    });
  }

  private onMessage(event: MessageEvent<WorkerMessage>) {
    const message = event.data;
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    if (message.type === "progress") {
      pending.onProgress?.(message.event);
      return;
    }

    this.pending.delete(message.id);

    if (message.type === "error") {
      pending.reject(new Error(message.message));
      return;
    }

    if (message.type === "loaded") {
      pending.resolve(undefined);
      return;
    }

    if (message.type === "embedded") {
      pending.resolve({ embeddings: message.embeddings });
    }
  }

  private onWorkerError(event: ErrorEvent) {
    const error = new Error(event.message || "Worker crashed.");
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
    this.loadPromise = null;
  }
}
