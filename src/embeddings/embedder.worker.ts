/// <reference lib="webworker" />
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

type LoadMessage = { id: number; type: "load"; model: string };
type EmbedMessage = { id: number; type: "embed"; texts: string[] };
type Incoming = LoadMessage | EmbedMessage;

type Outgoing =
  | { id: number; type: "loaded" }
  | { id: number; type: "embedded"; embeddings: number[][] }
  | { id: number; type: "progress"; event: unknown }
  | { id: number; type: "error"; message: string };

let extractor: FeatureExtractionPipeline | null = null;
let loadedModel: string | null = null;
let loadInFlight: Promise<void> | null = null;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener("message", async (event: MessageEvent<Incoming>) => {
  const message = event.data;
  try {
    if (message.type === "load") {
      await ensureLoaded(message.model, message.id);
      reply({ id: message.id, type: "loaded" });
      return;
    }

    if (message.type === "embed") {
      if (!extractor) {
        throw new Error("Embedder is not loaded.");
      }
      const output = await extractor(message.texts, {
        pooling: "mean",
        normalize: true,
      });
      reply({ id: message.id, type: "embedded", embeddings: output.tolist() as number[][] });
    }
  } catch (cause) {
    reply({
      id: message.id,
      type: "error",
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
});

async function ensureLoaded(model: string, id: number) {
  if (extractor && loadedModel === model) {
    return;
  }
  if (loadInFlight && loadedModel === model) {
    await loadInFlight;
    return;
  }

  loadedModel = model;
  loadInFlight = (async () => {
    extractor = (await pipeline("feature-extraction", model, {
      progress_callback: (event: unknown) => {
        reply({ id, type: "progress", event });
      },
    })) as FeatureExtractionPipeline;
  })();

  try {
    await loadInFlight;
  } finally {
    loadInFlight = null;
  }
}

function reply(message: Outgoing) {
  ctx.postMessage(message);
}
