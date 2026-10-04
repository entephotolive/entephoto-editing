
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

type AdjustmentKey =
  | "brightness"
  | "contrast"
  | "highlights"
  | "shadows"
  | "saturation"
  | "warmth";

type Adjustments = Record<AdjustmentKey, number>;
type Tab = "presets" | "adjust";

interface PhotoEditorProps {
  imageUrl: string;
  onClose?: () => void;
  onSave?: (editedFile: File, adjustments: Adjustments) => void;
}

const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  warmth: 0,
};

const PRESETS: {
  name: string;
  values: Adjustments;
  filter: string;
}[] = [
  {
    name: "Original",
    values: { ...DEFAULT_ADJUSTMENTS },
    filter: "none",
  },
  {
    name: "EntePhoto Natural",
    values: {
      brightness: 3,
      contrast: 8,
      highlights: -10,
      shadows: 9,
      saturation: 5,
      warmth: 1,
    },
    filter: "brightness(1.03) contrast(1.08) saturate(1.05)",
  },
  {
    name: "Warm",
    values: {
      brightness: 2,
      contrast: 4,
      highlights: -6,
      shadows: 5,
      saturation: 4,
      warmth: 18,
    },
    filter: "sepia(0.2) saturate(1.08) brightness(1.02)",
  },
  {
    name: "Vibrant",
    values: {
      brightness: 2,
      contrast: 12,
      highlights: -7,
      shadows: 4,
      saturation: 18,
      warmth: 1,
    },
    filter: "saturate(1.3) contrast(1.12)",
  },
  {
    name: "Cinematic",
    values: {
      brightness: -2,
      contrast: 16,
      highlights: -16,
      shadows: 9,
      saturation: -5,
      warmth: -5,
    },
    filter: "contrast(1.16) saturate(0.95) brightness(0.98)",
  },
  {
    name: "B&W",
    values: {
      brightness: 1,
      contrast: 14,
      highlights: -8,
      shadows: 6,
      saturation: -100,
      warmth: 0,
    },
    filter: "grayscale(1) contrast(1.14)",
  },
];

const CONTROLS: {
  key: AdjustmentKey;
  label: string;
  min: number;
  max: number;
}[] = [
  { key: "brightness", label: "Brightness", min: -50, max: 100 },
  { key: "contrast", label: "Contrast", min: -50, max: 100 },
  { key: "highlights", label: "Highlights", min: -100, max: 100 },
  { key: "shadows", label: "Shadows", min: -100, max: 100 },
  { key: "saturation", label: "Saturation", min: -100, max: 100 },
  { key: "warmth", label: "Warmth", min: -100, max: 100 },
];

// Keeps interactive preview work small, even for camera photos.
const PREVIEW_MAX_DIMENSION = 1400;

function getCanvasSize(
  width: number,
  height: number,
  maxDimension?: number
) {
  if (!maxDimension) {
    return { width, height };
  }

  const scale = Math.min(
    1,
    maxDimension / Math.max(width, height)
  );

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Draw and process an image on a canvas.
 * The preview uses a smaller canvas; export uses full resolution.
 */
function renderImage(
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  adjustments: Adjustments,
  maxDimension?: number
) {
  const size = getCanvasSize(
    image.naturalWidth,
    image.naturalHeight,
    maxDimension
  );

  canvas.width = size.width;
  canvas.height = size.height;

  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!ctx) {
    throw new Error("Unable to initialize the photo editor.");
  }

  ctx.drawImage(image, 0, 0, size.width, size.height);

  // Read and process pixels only on this canvas.
  const imageData = ctx.getImageData(
    0,
    0,
    size.width,
    size.height
  );

  const pixels = imageData.data;

  const brightness = adjustments.brightness * 0.65;
  const contrast = 1 + adjustments.contrast / 100;
  const saturation = 1 + adjustments.saturation / 100;
  const highlights = adjustments.highlights / 100;
  const shadows = adjustments.shadows / 100;
  const warmth = adjustments.warmth * 0.35;

  const contrastOffset = 128 * (1 - contrast);

  for (let i = 0; i < pixels.length; i += 4) {
    let r = pixels[i];
    let g = pixels[i + 1];
    let b = pixels[i + 2];

    // Brightness and contrast.
    r = r * contrast + contrastOffset + brightness;
    g = g * contrast + contrastOffset + brightness;
    b = b * contrast + contrastOffset + brightness;

    // Calculate luminance for highlight and shadow adjustments.
    const luminance =
      (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

    const highlightWeight = Math.max(0, luminance - 0.45) / 0.55;
    const shadowWeight = Math.max(0, 0.65 - luminance) / 0.65;

    const highlightChange =
      highlights * 100 * highlightWeight * highlightWeight;

    const shadowChange =
      shadows * 80 * shadowWeight * shadowWeight;

    r += highlightChange + shadowChange;
    g += highlightChange + shadowChange;
    b += highlightChange + shadowChange;

    // Saturation adjustment.
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    r = gray + (r - gray) * saturation;
    g = gray + (g - gray) * saturation;
    b = gray + (b - gray) * saturation;

    // Warmth: positive values warm the image; negative values cool it.
    r += warmth;
    b -= warmth;

    pixels[i] = Math.max(0, Math.min(255, r));
    pixels[i + 1] = Math.max(0, Math.min(255, g));
    pixels[i + 2] = Math.max(0, Math.min(255, b));
    // Keep the original alpha channel.
  }

  ctx.putImageData(imageData, 0, 0);
}

function adjustmentsEqual(a: Adjustments, b: Adjustments) {
  return (
    a.brightness === b.brightness &&
    a.contrast === b.contrast &&
    a.highlights === b.highlights &&
    a.shadows === b.shadows &&
    a.saturation === b.saturation &&
    a.warmth === b.warmth
  );
}

export default function PhotoEditor({
  imageUrl,
  onClose,
  onSave,
}: PhotoEditorProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const adjustmentsRef = useRef<Adjustments>({
    ...DEFAULT_ADJUSTMENTS,
  });

  const [adjustments, setAdjustments] = useState<Adjustments>({
    ...DEFAULT_ADJUSTMENTS,
  });
  const [activeTab, setActiveTab] = useState<Tab>("presets");
  const [selectedPreset, setSelectedPreset] = useState("Original");
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Keep the latest values available to scheduled rendering.
  const updateAdjustments = useCallback((next: Adjustments) => {
    adjustmentsRef.current = next;
    setAdjustments(next);

    const matchingPreset = PRESETS.find((preset) =>
      adjustmentsEqual(preset.values, next)
    );

    setSelectedPreset(matchingPreset?.name ?? "");
    setError("");
  }, []);

  const renderPreview = useCallback(() => {
    const image = imageRef.current;
    const canvas = previewCanvasRef.current;

    if (!image || !canvas || !image.complete || !image.naturalWidth) {
      return;
    }

    try {
      renderImage(
        image,
        canvas,
        adjustmentsRef.current,
        PREVIEW_MAX_DIMENSION
      );
      setError("");
    } catch (err) {
      console.error("Preview rendering failed:", err);
      setError("Unable to render this image. Please try another photo.");
    }
  }, []);

  // Schedule at most one preview render per animation frame.
  const schedulePreviewRender = useCallback(() => {
    if (frameRef.current !== null) return;

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      renderPreview();
    });
  }, [renderPreview]);

  useEffect(() => {
    if (imageLoaded) {
      schedulePreviewRender();
    }
  }, [adjustments, imageLoaded, schedulePreviewRender]);

  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
    setError("");
    setSaving(false);
    adjustmentsRef.current = { ...DEFAULT_ADJUSTMENTS };
    setAdjustments({ ...DEFAULT_ADJUSTMENTS });
    setSelectedPreset("Original");
  }, [imageUrl]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const handleImageLoad = useCallback(() => {
    setImageError(false);
    setImageLoaded(true);
  }, []);

  const handleImageError = useCallback(() => {
    setImageLoaded(false);
    setImageError(true);
    setError("This photo could not be loaded.");
  }, []);

  const handlePreset = useCallback(
    (preset: (typeof PRESETS)[number]) => {
      // One state update for all six values.
      updateAdjustments({ ...preset.values });
    },
    [updateAdjustments]
  );

  const handleSliderChange = useCallback(
    (key: AdjustmentKey, value: number) => {
      const control = CONTROLS.find((item) => item.key === key);
      if (!control) return;

      const clampedValue = Math.max(
        control.min,
        Math.min(control.max, value)
      );

      updateAdjustments({
        ...adjustmentsRef.current,
        [key]: clampedValue,
      });
    },
    [updateAdjustments]
  );

  const handleReset = useCallback(() => {
    updateAdjustments({ ...DEFAULT_ADJUSTMENTS });
  }, [updateAdjustments]);

  const handleSave = useCallback(async () => {
    const image = imageRef.current;

    if (!image || !imageLoaded || saving) return;

    setSaving(true);
    setError("");

    try {
      // Export at the original image resolution, not preview resolution.
      const exportCanvas = document.createElement("canvas");
      const finalAdjustments = { ...adjustmentsRef.current };

      renderImage(image, exportCanvas, finalAdjustments);

      const blob = await new Promise<Blob>((resolve, reject) => {
        exportCanvas.toBlob(
          (result) => {
            if (result) {
              resolve(result);
            } else {
              reject(new Error("Could not create the JPEG file."));
            }
          },
          "image/jpeg",
          0.94
        );
      });

      const editedFile = new File(
        [blob],
        `entephoto-${Date.now()}.jpg`,
        {
          type: "image/jpeg",
          lastModified: Date.now(),
        }
      );

      // Preserve the existing callback behavior.
      onSave?.(editedFile, finalAdjustments);

      // Download the full-resolution edited image.
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = editedFile.name;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      exportCanvas.width = 0;
      exportCanvas.height = 0;
    } catch (err) {
      console.error("Image export failed:", err);
      setError(
        "Unable to save this photo. Try again or use a smaller image."
      );
    } finally {
      setSaving(false);
    }
  }, [imageLoaded, onSave, saving]);

  const getPresetStyle = (
    preset: (typeof PRESETS)[number]
  ): CSSProperties => ({
    filter: preset.filter,
  });

  return (
    <div className="editor-overlay">
      <section
        className="editor"
        role="dialog"
        aria-modal="true"
        aria-label="Photo editor"
      >
        <header className="editor-header">
          <button
            type="button"
            className="back"
            onClick={onClose}
            aria-label="Close photo editor"
          >
            ←
          </button>

          <h1>Edit Photo</h1>

          <button
            type="button"
            className="header-save"
            onClick={handleSave}
            disabled={!imageLoaded || saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </header>

        <div className="preview">
          <img
            ref={imageRef}
            className="source-image"
            src={imageUrl}
            alt=""
            onLoad={handleImageLoad}
            onError={handleImageError}
            decoding="async"
          />

          <canvas
            ref={previewCanvasRef}
            aria-label="Edited photo preview"
          />

          {!imageLoaded && !imageError && (
            <div className="preview-message">
              <span className="spinner" />
              <p>Loading photo…</p>
            </div>
          )}

          {imageError && (
            <div className="preview-message">
              <p>Unable to load this photo.</p>
            </div>
          )}
        </div>

        <nav className="tabs" aria-label="Editing tools">
          <button
            type="button"
            className={activeTab === "presets" ? "active" : ""}
            onClick={() => setActiveTab("presets")}
          >
            Presets
          </button>

          <button
            type="button"
            className={activeTab === "adjust" ? "active" : ""}
            onClick={() => setActiveTab("adjust")}
          >
            Adjust
          </button>
        </nav>

        <div className="panel">
          {activeTab === "presets" ? (
            <section aria-label="Photo presets">
              <div className="group-label">Choose a look</div>

              <div className="preset-grid">
                {PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.name}
                    className={`preset ${
                      selectedPreset === preset.name ? "selected" : ""
                    }`}
                    onClick={() => handlePreset(preset)}
                    disabled={!imageLoaded}
                    aria-pressed={selectedPreset === preset.name}
                  >
                    <span className="preset-thumbnail">
                      <canvas
                        className="preset-placeholder"
                        aria-hidden="true"
                      />
                      <span
                        className="preset-preview-filter"
                        style={getPresetStyle(preset)}
                      >
                        <span className="preset-preview-symbol">
                          {preset.name === "B&W" ? "◐" : "✦"}
                        </span>
                      </span>
                    </span>

                    <span className="preset-name">{preset.name}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section aria-label="Photo adjustments">
              <div className="group-label">Fine-tune your photo</div>

              <div className="adjustments">
                {CONTROLS.map((control) => (
                  <div className="adjustment" key={control.key}>
                    <label
                      className="color-label"
                      htmlFor={`adjust-${control.key}`}
                    >
                      <span>{control.label}</span>

                      <input
                        className="value-input"
                        type="number"
                        min={control.min}
                        max={control.max}
                        step={1}
                        value={adjustments[control.key]}
                        disabled={!imageLoaded}
                        aria-label={`${control.label} value`}
                        onChange={(event) => {
                          const value = event.currentTarget.valueAsNumber;
                          if (Number.isFinite(value)) {
                            handleSliderChange(control.key, value);
                          }
                        }}
                        onBlur={(event) => {
                          if (event.currentTarget.value === "") {
                            handleSliderChange(control.key, 0);
                          }
                        }}
                      />
                    </label>

                    <input
                      id={`adjust-${control.key}`}
                      type="range"
                      min={control.min}
                      max={control.max}
                      step={1}
                      value={adjustments[control.key]}
                      disabled={!imageLoaded}
                      aria-label={control.label}
                      onChange={(event) =>
                        handleSliderChange(
                          control.key,
                          Number(event.currentTarget.value)
                        )
                      }
                      onDoubleClick={() =>
                        handleSliderChange(control.key, 0)
                      }
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {error && <p className="error">{error}</p>}
        </div>

        <footer className="editor-footer">
          <button
            type="button"
            className="reset"
            onClick={handleReset}
            disabled={!imageLoaded}
          >
            Reset adjustments
          </button>

          <button
            type="button"
            className="save-changes"
            onClick={handleSave}
            disabled={!imageLoaded || saving}
          >
            {saving ? (
              <>
                <span className="spinner" />
                Processing photo…
              </>
            ) : (
              "Download photo"
            )}
          </button>
        </footer>
      </section>
    </div>
  );
}
