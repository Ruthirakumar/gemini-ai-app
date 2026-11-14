"use client";

import { DragEvent, useRef, useState } from "react";
/* eslint-disable @next/next/no-img-element -- local object-URL previews, not optimisable */
import {
  ACCEPT_ATTRIBUTE,
  formatBytes,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
} from "@/lib/homework/constants";

export interface UploadedImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface Props {
  images: UploadedImage[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onReplace: (id: string, file: File) => void;
  disabled?: boolean;
}

export default function ImageUploader({ images, onAdd, onRemove, onReplace, disabled }: Props) {
  const browseRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const canAddMore = images.length < MAX_IMAGES;

  function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    onAdd(Array.from(list));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    handleFiles(event.dataTransfer.files);
  }

  function startReplace(id: string) {
    replaceTarget.current = id;
    replaceRef.current?.click();
  }

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-slate-700">2. Add a photo of your homework</p>

      {/* Hidden inputs. They are reset after each use so the same file can be chosen again. */}
      <input
        ref={browseRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={replaceRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && replaceTarget.current) onReplace(replaceTarget.current, file);
          replaceTarget.current = null;
          e.target.value = "";
        }}
      />

      {canAddMore && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 text-center transition-colors ${
            images.length > 0 ? "py-6" : "py-10 sm:py-14"
          } ${
            dragging
              ? "border-indigo-500 bg-indigo-50"
              : "border-slate-300 bg-slate-50/60 hover:border-slate-400"
          } ${disabled ? "opacity-60" : ""}`}
        >
          {images.length === 0 && (
            <div aria-hidden className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white text-3xl shadow-sm ring-1 ring-slate-200">
              📸
            </div>
          )}
          <p className="font-medium text-slate-800">
            {images.length === 0 ? "Drag and drop your worksheet photo here" : "Add another page (optional)"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            PDF, JPG, PNG or WebP · up to {formatBytes(MAX_IMAGE_BYTES)} each · up to {MAX_IMAGES} files
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => browseRef.current?.click()}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed"
            >
              Browse files
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => cameraRef.current?.click()}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed"
            >
              Take a photo
            </button>
          </div>
        </div>
      )}

      {images.length > 0 && (
        <ul className={`grid gap-3 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"} ${canAddMore ? "mt-4" : ""}`}>
          {images.map((image, index) => (
            <li key={image.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className={`relative bg-slate-100 ${images.length === 1 ? "h-72 sm:h-96" : "h-40 sm:h-48"}`}>
                {image.file.type === "application/pdf" ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-600">
                    <span aria-hidden className="text-4xl">📄</span>
                    <span className="text-sm font-semibold">PDF document</span>
                  </div>
                ) : (
                  <img
                    src={image.previewUrl}
                    alt={`Homework page ${index + 1} preview`}
                    className="h-full w-full object-contain"
                  />
                )}
                {images.length > 1 && (
                  <span className="absolute left-2 top-2 rounded-lg bg-slate-900/75 px-2 py-0.5 text-xs font-semibold text-white">
                    Page {index + 1}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <p className="min-w-0 truncate text-xs text-slate-500" title={image.file.name}>
                  {image.file.name} · {formatBytes(image.file.size)}
                </p>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => startReplace(image.id)}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onRemove(image.id)}
                    aria-label={`Remove page ${index + 1}`}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
