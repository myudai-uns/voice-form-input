// Whisper をブラウザ内で実行（ブックマーク方式）。ページから blob ワーカー経由で読み込まれる
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";

env.allowLocalModels = false;   // モデルは初回のみHugging Faceから取得 → ブラウザ内にキャッシュ
env.useBrowserCache = true;

let asr = null;

// 選べるモデル（大きいものは4bit量子化で容量を抑える）
const MODELS = {
  tiny: { id: "onnx-community/whisper-tiny" },
  base: { id: "onnx-community/whisper-base" },
  small: { id: "onnx-community/whisper-small" },
  turbo: { id: "onnx-community/whisper-large-v3-turbo", big: true },        // 高精度・多言語
  kotoba: { id: "onnx-community/kotoba-whisper-v2.2-ONNX", big: true },     // 日本語特化
};

async function load(model, device, threads) {
  env.backends.onnx.wasm.numThreads = threads;
  const m = MODELS[model] || MODELS.base;
  const dtype = m.big ? { encoder_model: "q4", decoder_model_merged: "q4" }
    : device === "webgpu" ? { encoder_model: "fp32", decoder_model_merged: "q4" } : "q8";
  asr = await pipeline("automatic-speech-recognition", m.id, {
    device, dtype,
    progress_callback: (p) => {
      if (p.status === "progress") self.postMessage({ type: "progress", file: p.file, pct: Math.round(p.progress) });
    },
  });
  await asr(new Float32Array(16000), { language: "japanese", task: "transcribe" }); // 初回の重い処理を先に済ませる
}

self.onmessage = async (e) => {
  const { type } = e.data;
  try {
    if (type === "load") {
      const t0 = performance.now();
      let device = e.data.device;
      if (device === "auto") device = (self.navigator.gpu && (await self.navigator.gpu.requestAdapter())) ? "webgpu" : "wasm";
      let threads = self.crossOriginIsolated ? Math.min(4, Math.max(1, (self.navigator.hardwareConcurrency || 2) >> 1)) : 1;
      try {
        await load(e.data.model, device, threads);
      } catch (err) {
        if (device === "wasm" && threads > 1) { threads = 1; await load(e.data.model, device, 1); } // 並列が使えない環境は1スレッドで再試行
        else throw err;
      }
      self.postMessage({ type: "ready", device, model: e.data.model, threads, loadMs: Math.round(performance.now() - t0) });
    } else if (type === "run") {
      if (!asr) throw new Error("モデル未読み込み");
      const t0 = performance.now();
      const out = await asr(e.data.audio, { language: "japanese", task: "transcribe" });
      self.postMessage({ type: "result", text: (out.text || "").trim(), ms: Math.round(performance.now() - t0) });
    }
  } catch (err) {
    self.postMessage({ type: "error", message: String(err?.message || err) });
  }
};
