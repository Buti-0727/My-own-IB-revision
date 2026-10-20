"use client";

import Image from "next/image";
import { useState, type Dispatch, type SetStateAction } from "react";

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface AnswerComposerValue {
  text: string;
  images: string[];
  imageNames: string[];
}

interface AnswerComposerProps {
  value: AnswerComposerValue;
  onChange: Dispatch<SetStateAction<AnswerComposerValue>>;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error(`Could not read ${file.name}.`));
    }, { once: true });
    reader.addEventListener("error", () => reject(new Error(`Could not read ${file.name}.`)), { once: true });
    reader.readAsDataURL(file);
  });
}

export function AnswerComposer({ value, onChange }: AnswerComposerProps) {
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  async function handleImages(files: File[]) {
    setError(null);
    if (value.images.length + files.length > MAX_IMAGES) {
      setError(`Choose no more than ${MAX_IMAGES} answer photos.`);
      return;
    }
    const invalidType = files.find((file) => !SUPPORTED_IMAGE_TYPES.has(file.type));
    if (invalidType) {
      setError("Choose JPEG, PNG, or WebP answer photos.");
      return;
    }
    const oversized = files.find((file) => file.size > MAX_IMAGE_BYTES);
    if (oversized) {
      setError("Each answer photo must be smaller than 5 MB.");
      return;
    }

    setReading(true);
    try {
      const additions = await Promise.all(files.map(async (file) => ({
        name: file.name,
        dataUrl: await fileToDataUrl(file),
      })));
      const images = [...value.images, ...additions.map(({ dataUrl }) => dataUrl)];
      if (images.reduce((total, image) => total + image.length, 0) > 10 * 1024 * 1024) {
        throw new Error("These photos are too large to send together. Choose fewer or smaller images.");
      }
      onChange((current) => ({
        ...current,
        images: [...current.images, ...additions.map(({ dataUrl }) => dataUrl)],
        imageNames: [...current.imageNames, ...additions.map(({ name }) => name)],
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The answer photos could not be read.");
    } finally {
      setReading(false);
    }
  }

  function removeImage(index: number) {
    onChange({
      ...value,
      images: value.images.filter((_, imageIndex) => imageIndex !== index),
      imageNames: value.imageNames.filter((_, imageIndex) => imageIndex !== index),
    });
  }

  return (
    <section className="answer-composer" aria-labelledby="answer-composer-title">
      <div className="answer-composer-heading">
        <div>
          <p className="eyebrow">Your attempt</p>
          <h2 id="answer-composer-title">Write or add answer photos</h2>
        </div>
        <span className="local-badge">Not saved</span>
      </div>
      <label className="field-group answer-text-field">
        <span>Type your answer</span>
        <textarea
          rows={6}
          value={value.text}
          onChange={(event) => onChange({ ...value, text: event.currentTarget.value })}
          placeholder="Write what you would put in the exam…"
        />
      </label>
      <label className="field-group answer-image-field">
        <span>Add answer photos (optional)</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={reading || value.images.length >= MAX_IMAGES}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            void handleImages(files);
            event.currentTarget.value = "";
          }}
        />
      </label>
      <p className="field-help">Photos stay in memory and are sent only to your local LM Studio if you request feedback.</p>
      {reading && <p className="field-help" role="status">Reading answer photos…</p>}
      {value.images.length > 0 && (
        <div className="answer-image-list" aria-label="Selected answer photos">
          {value.images.map((image, index) => (
            <figure className="answer-image-item" key={`${value.imageNames[index]}-${index}`}>
              <Image src={image} alt={`Answer photo ${index + 1}: ${value.imageNames[index]}`} width={180} height={140} unoptimized />
              <figcaption>
                <span>{value.imageNames[index]}</span>
                <button className="text-button" type="button" onClick={() => removeImage(index)} aria-label={`Remove ${value.imageNames[index]}`}>
                  Remove
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </section>
  );
}
