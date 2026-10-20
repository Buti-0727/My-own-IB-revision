"use client";

import { useEffect, useState } from "react";
import { modelListSchema, feedbackResultSchema, type FeedbackResult } from "../../lib/ai/contracts";
import type { AppSettingsRecord } from "../../lib/domain/types";
import { revisionDb } from "../../lib/storage/db";
import { createRepositories } from "../../lib/storage/repositories";

type CheckKind = "text" | "image";

const MAX_SAMPLE_IMAGE_BYTES = 5 * 1024 * 1024;

async function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The selected image could not be read."));
    }, { once: true });
    reader.addEventListener("error", () => reject(new Error("The selected image could not be read.")), { once: true });
    reader.readAsDataURL(file);
  });
}

async function saveSelectedModel(modelId: string): Promise<void> {
  const repositories = createRepositories(revisionDb);
  const existing = await repositories.getSettings();
  const settings: AppSettingsRecord = {
    id: "app",
    examSession: existing?.examSession ?? "",
    syllabusVersions: existing?.syllabusVersions ?? {},
    selectedModelId: modelId,
    ...(existing?.lmStudioBaseUrl ? { lmStudioBaseUrl: existing.lmStudioBaseUrl } : {}),
  };
  await repositories.saveSettings(settings);
}

export function LMStudioSettings() {
  const [models, setModels] = useState<Array<{ id: string }>>([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [sampleImage, setSampleImage] = useState<File | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [checking, setChecking] = useState<CheckKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<FeedbackResult | null>(null);

  useEffect(() => {
    let active = true;
    void createRepositories(revisionDb).getSettings()
      .then((settings) => {
        if (active && settings?.selectedModelId) setSelectedModelId(settings.selectedModelId);
      })
      .catch(() => {
        if (active) setError("Your saved settings could not be opened in this browser.");
      });
    return () => { active = false; };
  }, []);

  async function findModels() {
    setLoadingModels(true);
    setError(null);
    setNotice(null);
    setTestResult(null);
    try {
      const response = await fetch("/api/lmstudio/models", { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof payload === "object" && payload !== null && "error" in payload &&
          typeof payload.error === "object" && payload.error !== null && "message" in payload.error &&
          typeof payload.error.message === "string"
          ? payload.error.message
          : "LM Studio could not be reached.";
        throw new Error(message);
      }
      const parsed = modelListSchema.safeParse(payload);
      if (!parsed.success) throw new Error("LM Studio returned a model list this app could not read.");
      setModels(parsed.data.models);
      setSelectedModelId((current) => parsed.data.models.some(({ id }) => id === current) ? current : "");
      if (parsed.data.models.length === 0) {
        setSelectedModelId("");
        setNotice("LM Studio is reachable, but it did not return any models. Load a model in LM Studio, then check again.");
      } else {
        setNotice(`${parsed.data.models.length} local model${parsed.data.models.length === 1 ? "" : "s"} found. Choose one, then run its text or image check.`);
      }
    } catch (cause) {
      setModels([]);
      setError(cause instanceof Error ? cause.message : "LM Studio could not be reached.");
    } finally {
      setLoadingModels(false);
    }
  }

  async function handleModelChange(modelId: string) {
    setSelectedModelId(modelId);
    setError(null);
    setNotice(null);
    setTestResult(null);
    if (!modelId) return;
    try {
      await saveSelectedModel(modelId);
      setNotice("Your chosen model is saved in this browser.");
    } catch {
      setError("The model is selected, but its setting could not be saved in this browser.");
    }
  }

  async function runCheck(kind: CheckKind) {
    if (!selectedModelId) return;
    setChecking(kind);
    setError(null);
    setNotice(null);
    setTestResult(null);
    try {
      const images = kind === "image" && sampleImage ? [await fileAsDataUrl(sampleImage)] : undefined;
      const response = await fetch("/api/lmstudio/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          modelId: selectedModelId,
          questionText: "Local setup diagnostic: describe the main idea in the supplied response.",
          answer: {
            ...(kind === "text" ? { text: "This is a local model setup check." } : {}),
            ...(images ? { images } : {}),
          },
          markschemeText: "Diagnostic criterion: return a concise, relevant explanation. This test does not use or create a practice question.",
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof payload === "object" && payload !== null && "error" in payload &&
          typeof payload.error === "object" && payload.error !== null && "message" in payload.error &&
          typeof payload.error.message === "string"
          ? payload.error.message
          : "The local model check did not complete.";
        throw new Error(message);
      }
      const parsed = feedbackResultSchema.safeParse(payload);
      if (!parsed.success) throw new Error("The local model returned feedback this app could not read.");
      setTestResult(parsed.data);
      setNotice(kind === "text"
        ? "Text check passed. This setup result is temporary and is not saved as practice progress."
        : "Image check passed. This confirms the model read this sample; it does not guarantee every answer photo will be clear.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The local model check did not complete.");
    } finally {
      setChecking(null);
    }
  }

  const canTest = Boolean(selectedModelId) && models.some(({ id }) => id === selectedModelId);

  function handleImageChange(file: File | undefined) {
    setError(null);
    setNotice(null);
    setTestResult(null);
    if (!file) {
      setSampleImage(null);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setSampleImage(null);
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_SAMPLE_IMAGE_BYTES) {
      setSampleImage(null);
      setError("Choose an image smaller than 5 MB for this check.");
      return;
    }
    setSampleImage(file);
  }

  return (
    <div className="section-empty local-ai-settings">
      <p className="eyebrow">Your setup</p>
      <h1>Settings</h1>
      <p className="intro-copy">Connect the local model on this laptop. Your study papers stay in this browser; AI requests go only to your local LM Studio server.</p>

      <section className="local-ai-card" aria-labelledby="local-ai-title">
        <div className="local-ai-heading">
          <div>
            <span className="setting-label">AI feedback</span>
            <h2 id="local-ai-title">LM Studio on this laptop</h2>
          </div>
          <span className="local-badge">Loopback only</span>
        </div>
        <p className="local-ai-description">
          Start LM Studio’s local server, then check for models. The default address is 127.0.0.1:1234; this app does not fall back to an online AI service.
        </p>
        <div className="local-ai-controls">
          <button className="secondary-button" type="button" onClick={() => void findModels()} disabled={loadingModels || checking !== null}>
            {loadingModels ? "Checking…" : "Find local models"}
          </button>
          <label className="field-group local-model-field">
            <span>Local model</span>
            <select
              value={selectedModelId}
              onChange={(event) => void handleModelChange(event.currentTarget.value)}
              disabled={models.length === 0 || checking !== null}
            >
              <option value="">Choose a model</option>
              {models.map(({ id }) => <option value={id} key={id}>{id}</option>)}
            </select>
          </label>
        </div>
        <p className="local-ai-hint">
          Finding a model confirms the server is reachable. Use the separate text and image checks to test how that model responds.
        </p>
      </section>

      <div className="local-ai-test-grid">
        <section className="local-ai-test-card" aria-labelledby="text-check-title">
          <span className="setting-label">Text response</span>
          <h2 id="text-check-title">Check text feedback</h2>
          <p>Runs a short setup diagnostic. It is not a practice question and nothing is added to your progress.</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => void runCheck("text")}
            disabled={!canTest || checking !== null || loadingModels}
          >
            {checking === "text" ? "Testing…" : "Test text feedback"}
          </button>
        </section>

        <section className="local-ai-test-card" aria-labelledby="image-check-title">
          <span className="setting-label">Image response</span>
          <h2 id="image-check-title">Check answer-photo reading</h2>
          <p>Choose a sample answer photo. It is sent only to the local model for this check and is not saved.</p>
          <label className="field-group local-image-field">
            <span>Optional sample answer image</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => handleImageChange(event.currentTarget.files?.[0])}
            />
          </label>
          {sampleImage && <small className="local-image-name">{sampleImage.name} · {(sampleImage.size / 1024).toFixed(0)} KB</small>}
          <button
            className="primary-button"
            type="button"
            onClick={() => void runCheck("image")}
            disabled={!canTest || !sampleImage || checking !== null || loadingModels}
          >
            {checking === "image" ? "Testing…" : "Test image feedback"}
          </button>
        </section>
      </div>

      {error && <p className="inline-error" role="alert">{error}</p>}
      {notice && <p className="inline-success" role="status">{notice}</p>}
      {testResult && (
        <section className="local-ai-result" aria-label="Temporary model test result">
          <h2>Temporary feedback</h2>
          <p>{testResult.explanation}</p>
          {testResult.uncertainty.length > 0 && <p>Uncertainty: {testResult.uncertainty.join(" ")}</p>}
        </section>
      )}

      <div className="settings-preview local-storage-note">
        <div>
          <span className="setting-label">Your library</span>
          <strong>Stored in this browser</strong>
        </div>
        <div>
          <span className="setting-label">Answer tests</span>
          <strong>Temporary and not saved</strong>
        </div>
      </div>
    </div>
  );
}
