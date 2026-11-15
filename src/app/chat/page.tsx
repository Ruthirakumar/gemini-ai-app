import type { Metadata } from "next";
import AskBuddy from "@/components/ask/AskBuddy";
import { PageShell } from "@/components/ui";

export const metadata: Metadata = {
  title: "Ask Buddy · AI Homework Buddy",
};

export default function AskPage() {
  return (
    <PageShell>
      <AskBuddy />
    </PageShell>
  );
}
