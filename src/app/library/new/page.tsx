import { Suspense } from "react";
import AuthGate from "@/components/auth/AuthGate";
import UploadHomework from "@/components/library/UploadHomework";
import { PageShell, Spinner } from "@/components/ui";

async function UploadForRoute({ searchParams }: { searchParams: PageProps<"/library/new">["searchParams"] }) {
  const { shared } = await searchParams;
  return <UploadHomework shared={shared === "1"} />;
}

export default function NewHomeworkPage({ searchParams }: PageProps<"/library/new">) {
  return (
    <AuthGate intro="Sign in to upload homework.">
      <PageShell>
        <Suspense fallback={<Spinner />}>
          <UploadForRoute searchParams={searchParams} />
        </Suspense>
      </PageShell>
    </AuthGate>
  );
}
