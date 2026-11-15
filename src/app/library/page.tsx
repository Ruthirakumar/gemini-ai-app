import { Suspense } from "react";
import AuthGate from "@/components/auth/AuthGate";
import LibraryList from "@/components/library/LibraryList";
import { PageShell, Spinner } from "@/components/ui";

async function LibraryForRoute({ searchParams }: { searchParams: PageProps<"/library">["searchParams"] }) {
  const { scope } = await searchParams;
  return <LibraryList initialScope={scope === "shared" ? "shared" : "mine"} />;
}

export default function LibraryPage({ searchParams }: PageProps<"/library">) {
  return (
    <AuthGate intro="Sign in to manage your homework library.">
      <PageShell wide>
        <Suspense fallback={<Spinner label="Loading homework…" />}>
          <LibraryForRoute searchParams={searchParams} />
        </Suspense>
      </PageShell>
    </AuthGate>
  );
}
