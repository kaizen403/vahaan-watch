"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import Link from "next/link";

interface Detection {
  timestamp: string;
  plate: string;
  country: string;
  make: string;
  model: string;
  color: string;
  category: string;
}

interface ScanResult {
  success: boolean;
  detections: Detection[];
  framesProcessed: number;
  duration: number;
  error?: string;
}

type AppState = "idle" | "scanning" | "results" | "error";

const REGIONS = [
  { value: "SAS", label: "South Asia — India, Pakistan, Bangladesh (SAS)" },
  { value: "EUR", label: "Europe (EUR)" },
  { value: "NAM", label: "North America (NAM)" },
  { value: "AFR", label: "Africa (AFR)" },
];

interface ParsedColor {
  r: number;
  g: number;
  b: number;
  valid: boolean;
}

function parseColorString(colorStr: string): ParsedColor {
  const match = colorStr.match(/R=(\d+),\s*G=(\d+),\s*B=(\d+)/);
  if (!match) return { r: 128, g: 128, b: 128, valid: false };
  return {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10),
    valid: true,
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getCategoryBadgeClass(category: string): string {
  const upper = category.toUpperCase();
  if (upper === "CAR") return "bg-gray-700 text-white";
  if (upper === "VAN") return "bg-gray-700 text-white";
  if (upper.includes("PICK") || upper === "PICKUP")
    return "bg-gray-700 text-white";
  return "bg-gray-700 text-white";
}

export default function HomePage() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [region, setRegion] = useState("SAS");
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptedExtensions = ".mp4,.avi,.mkv,.mjpeg";

  function handleFileSelect(file: File) {
    setSelectedFile(file);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
  }

  function handleDragOver(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  async function handleScan() {
    if (!selectedFile) return;
    setAppState("scanning");

    const formData = new FormData();
    formData.append("video", selectedFile);
    formData.append("region", region);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        body: formData,
      });

      let data: ScanResult;
      try {
        data = await response.json();
      } catch {
        setErrorMessage(`Server error (HTTP ${response.status}) — try a shorter video or hard-refresh the page`);
        setAppState("error");
        return;
      }

      if (!data.success) {
        setErrorMessage(data.error ?? "Scan failed");
        setAppState("error");
        return;
      }

      setResult(data);
      setAppState("results");
    } catch {
      setErrorMessage("Could not reach the server — check your connection and try again");
      setAppState("error");
    }
  }

  function handleReset() {
    setAppState("idle");
    setSelectedFile(null);
    setResult(null);
    setErrorMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <header className="mb-10 text-center">
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-white">
            Carmen ANPR Scanner
          </h1>
        </header>

        <nav className="mb-8 flex justify-center gap-1 rounded-xl border border-gray-800 bg-gray-950 p-1">
          <span className="flex-1 rounded-lg bg-white px-4 py-2 text-center text-sm font-medium text-black">
            Upload Video
          </span>
          <Link
            href="/realtime"
            className="flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium text-gray-400 hover:text-white transition-colors"
          >
            Live Camera
          </Link>
        </nav>

        {appState === "scanning" && (
          <div className="flex flex-col items-center gap-6 py-20">
            <div className="relative h-16 w-16">
              <div className="absolute inset-0 rounded-full border-2 border-gray-700"></div>
              <div className="absolute inset-0 rounded-full border-t-2 border-white animate-spin"></div>
            </div>
            <div className="text-center">
              <p className="text-lg font-medium text-white">
                Processing video…
              </p>
              <p className="mt-1 text-sm text-gray-500">
                This may take 2–5 minutes depending on video length
              </p>
            </div>
          </div>
        )}

        {appState === "idle" && (
          <div className="space-y-5">
            <label
              htmlFor="video-file-input"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={[
                "relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors cursor-pointer",
                isDragging
                  ? "border-white bg-gray-900"
                  : selectedFile
                    ? "border-gray-600 bg-black"
                    : "border-gray-700 bg-black hover:border-gray-500",
              ].join(" ")}
            >
              <input
                id="video-file-input"
                ref={fileInputRef}
                type="file"
                accept={acceptedExtensions}
                onChange={handleInputChange}
                className="sr-only"
              />
              {selectedFile ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-white">
                    <svg
                      aria-hidden="true"
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="font-medium">{selectedFile.name}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(selectedFile.size)}
                  </p>
                  <p className="text-xs text-gray-600 mt-2">
                    Click to change file
                  </p>
                </div>
              ) : (
                <>
                  <div className="rounded-full bg-gray-900 p-4">
                    <svg
                      aria-hidden="true"
                      className="h-8 w-8 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-300">
                      Drop a video here or click to browse
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      .mp4 · .avi · .mkv · .mjpeg
                    </p>
                  </div>
                </>
              )}
            </label>

            <div className="flex items-center gap-3">
              <label
                htmlFor="region"
                className="text-sm text-gray-400 whitespace-nowrap"
              >
                Detection region
              </label>
              <select
                id="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="flex-1 rounded-lg border border-gray-700 bg-black px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
              >
                {REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleScan}
              disabled={!selectedFile}
              className={[
                "w-full rounded-xl px-6 py-3.5 text-sm font-semibold tracking-wide transition-all",
                selectedFile
                  ? "bg-white text-black hover:bg-gray-200 active:scale-[0.99]"
                  : "cursor-not-allowed bg-gray-800 text-gray-600",
              ].join(" ")}
            >
              Scan Video
            </button>
          </div>
        )}

        {appState === "results" && result && (
          <div className="space-y-6">
            <div className="flex items-center justify-between rounded-xl border border-gray-700 bg-black px-5 py-4">
              <div>
                <p className="text-lg font-semibold text-white">
                  {result.detections.length === 0 ? (
                    "No vehicles detected"
                  ) : (
                    <>
                      Found{" "}
                      <span className="text-white">
                        {result.detections.length}
                      </span>{" "}
                      vehicle{result.detections.length !== 1 ? "s" : ""}
                    </>
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Processed in{" "}
                  <span className="text-white">
                    {result.duration.toFixed(1)}s
                  </span>
                  {result.framesProcessed > 0 &&
                    ` · ${result.framesProcessed} frames`}
                </p>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-white hover:text-white transition-colors"
              >
                Scan Another
              </button>
            </div>

            {result.detections.length === 0 ? (
              <div className="rounded-xl border border-gray-700 bg-black px-6 py-10 text-center text-gray-500 text-sm">
                No plates were detected in this video. Try a different region or
                a clearer video.
              </div>
            ) : (
              <div className="space-y-3">
                {result.detections.map((d, i) => {
                  const parsedColor = parseColorString(d.color);
                  return (
                    <div
                      key={`${d.plate}-${d.timestamp}`}
                      className="rounded-xl border border-gray-700 bg-black p-5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-mono text-2xl font-bold tracking-widest text-white bg-black px-3 py-1 rounded-lg border border-gray-700">
                              {d.plate}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-300">
                            {(d.make || d.model) && (
                              <span>
                                {[d.make, d.model].filter(Boolean).join(" ")}
                              </span>
                            )}
                            {d.category && (
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${getCategoryBadgeClass(d.category)}`}
                              >
                                {d.category}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          {parsedColor.valid && (
                            <div className="flex items-center gap-2">
                              <div
                                className="h-5 w-5 rounded-full border border-gray-600 ring-2 ring-gray-800 shrink-0"
                                style={{
                                  backgroundColor: `rgb(${parsedColor.r},${parsedColor.g},${parsedColor.b})`,
                                }}
                              ></div>
                            </div>
                          )}
                          {d.timestamp && (
                            <span className="text-xs text-gray-500 font-mono">
                              {d.timestamp}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {appState === "error" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-5 border-l-4 border-l-red-500">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0 rounded-full bg-red-900/40 p-1">
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4 text-red-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-red-300 text-sm">
                    Scan failed
                  </p>
                  <p className="mt-1 text-xs text-red-400/80">{errorMessage}</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="w-full rounded-xl border border-gray-700 px-6 py-3 text-sm text-gray-300 hover:border-white hover:text-white transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
