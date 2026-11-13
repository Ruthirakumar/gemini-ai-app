"use client";

import { useEffect, useRef, useState } from "react";
import {
  describeImageProblem,
  formatBytes,
  MAX_IMAGES,
  MAX_TOTAL_BYTES,
  SubjectOption,
} from "@/lib/homework/constants";
import type { ApiErrorResponse, HomeworkCheckResponse, HomeworkResult } from "@/lib/homework/types";
import AnalysisProgress from "./AnalysisProgress";
import HomeworkResults from "./HomeworkResults";
import ImageUploader, { UploadedImage } from "./ImageUploader";
import SubjectSelector from "./SubjectSelector";

type Phase = "upload" | "checking" | "results";

let nextId = 0;
const makeImage = (file: File): UploadedImage => ({
  id: `img-${++nextId}`,
  file,
  previewUrl: URL.createObjectURL(file),
});

export default function HomeworkChecker() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [subject, setSubject] = useState<SubjectOption>("auto");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HomeworkResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const imagesRef = useRef<UploadedImage[]>([]);

  // Keep a ref of current images so object URLs can be revoked on unmount.
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(
    () => () => {
      imagesRef.current.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      abortRef.current?.abort();
    },
    []
  );

  function addFiles(files: File[]) {
    setError(null);
    const room = MAX_IMAGES - images.length;
    const accepted: UploadedImage[] = [];
    const problems: string[] = [];

    for (const file of files) {
      const problem = describeImageProblem(file);
      if (problem) problems.push(problem);
      else if (accepted.length < room) accepted.push(makeImage(file));
      else problems.push(`You can add up to ${MAX_IMAGES} pages at a time.`);
    }

    if (accepted.length) setImages((prev) => [...prev, ...accepted]);
    if (problems.length) setError([...new Set(problems)].join(" "));
  }

  function removeImage(id: string) {
    setError(null);
    const target = images.find((img) => img.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    setImages((prev) => prev.filter((img) => img.id !== id));
  }

  function replaceImage(id: string, file: File) {
    const problem = describeImageProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const old = images.find((img) => img.id === id);
    if (!old) return;
    URL.revokeObjectURL(old.previewUrl);
    const replacement = makeImage(file);
    setImages((prev) => prev.map((img) => (img.id === id ? replacement : img)));
  }

  async function checkHomework() {
    if (images.length === 0) {
      setError("Please add a photo of your homework first.");
      return;
    }
    const total = images.reduce((sum, img) => sum + img.file.size, 0);
    if (total > MAX_TOTAL_BYTES) {
      setError(`Together your pictures are ${formatBytes(total)}. Please keep the total under ${formatBytes(MAX_TOTAL_BYTES)}.`);
      return;
    }

    setError(null);
    setPhase("checking");
    const controller = new AbortController();
    abortRef.current = controller;

    const body = new FormData();
    body.append("subject", subject);
    images.forEach((img) => body.append("images", img.file, img.file.name));

    try {
      const res = await fetch("/api/homework/check", { method: "POST", body, signal: controller.signal });
      let data: HomeworkCheckResponse | ApiErrorResponse;
      try {
        data = await res.json();
      } catch {
        throw new Error(
          res.status === 413
            ? "Your pictures are too big to upload. Please try a smaller photo."
            : "Homework Buddy couldn't be reached. Please check your internet connection and try again."
        );
      }
      if (!data.success) throw new Error(data.error);

      setResult(data.result);
      setPhase("results");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (controller.signal.aborted) {
        setPhase("upload");
        return;
      }
      setError(
        err instanceof TypeError
          ? "Homework Buddy couldn't be reached. Please check your internet connection and try again."
          : err instanceof Error
            ? err.message
            : "Something went wrong. Please try again."
      );
      setPhase("upload");
    } finally {
      abortRef.current = null;
    }
  }

  function startOver() {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setResult(null);
    setError(null);
    setPhase("upload");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (phase === "results" && result) {
    return <HomeworkResults result={result} pageCount={images.length} onStartOver={startOver} />;
  }

  if (phase === "checking") {
    return <AnalysisProgress pageCount={images.length} onCancel={() => abortRef.current?.abort()} />;
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">AI Homework Buddy</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Let&apos;s check your homework together!
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-slate-600">
          Take a photo of your English or Maths worksheet. I&apos;ll mark it, explain anything tricky and give you
          practice questions to help you learn.
        </p>
      </div>

      <div className="space-y-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <SubjectSelector value={subject} onChange={setSubject} />
        <ImageUploader images={images} onAdd={addFiles} onRemove={removeImage} onReplace={replaceImage} />

        {error && (
          <div role="alert" className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <span aria-hidden>⚠️</span>
            <p>{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={checkHomework}
          disabled={images.length === 0}
          className="w-full rounded-2xl bg-indigo-600 px-6 py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Check My Homework
        </button>
      </div>

      <ul className="mt-6 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
        {[
          ["💡", "Make sure the whole page is in the photo"],
          ["☀️", "Use good light and avoid shadows"],
          ["🔒", "Photos are checked and not saved"],
        ].map(([icon, text]) => (
          <li key={text} className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 ring-1 ring-slate-200">
            <span aria-hidden>{icon}</span>
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}
