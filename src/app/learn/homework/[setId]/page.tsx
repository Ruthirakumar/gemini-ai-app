import { Suspense } from "react";
import AuthGate from "@/components/auth/AuthGate";
import HomeworkOverview from "@/components/learn/HomeworkOverview";
import { ErrorBanner, PageShell, Spinner } from "@/components/ui";

async function OverviewForRoute({
  params,
  searchParams,
}: {
  params: PageProps<"/learn/homework/[setId]">["params"];
  searchParams: PageProps<"/learn/homework/[setId]">["searchParams"];
}) {
  const [{ setId }, { student }] = await Promise.all([params, searchParams]);
  if (typeof student !== "string") return <ErrorBanner message="Please choose who is practising from the Practise page." />;
  return <HomeworkOverview key={`${setId}-${student}`} setId={setId} studentId={student} />;
}

export default function HomeworkOverviewPage({ params, searchParams }: PageProps<"/learn/homework/[setId]">) {
  return (
    <AuthGate intro="A grown-up needs to sign in first.">
      <PageShell>
        <Suspense fallback={<Spinner label="Loading your scores…" />}>
          <OverviewForRoute params={params} searchParams={searchParams} />
        </Suspense>
      </PageShell>
    </AuthGate>
  );
}
