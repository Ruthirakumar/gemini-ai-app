"use client";

import { fetchJson } from "@/lib/client/fetchJson";

/** Opens the private original worksheet via a short-lived signed URL. */
export async function openOriginalFile(setId: string, page?: number | null) {
  // Open the tab synchronously (inside the click) so pop-up blockers allow it.
  const tab = window.open("about:blank", "_blank");
  try {
    const { url, fileType } = await fetchJson<{ url: string; fileType: string | null }>(`/api/library/sets/${setId}/file`);
    const target = fileType === "application/pdf" && page ? `${url}#page=${page}` : url;
    if (tab) tab.location.href = target;
    else window.location.href = target;
  } catch (error) {
    tab?.close();
    throw error;
  }
}
