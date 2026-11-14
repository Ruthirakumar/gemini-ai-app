import { Suspense } from "react";
import AuthGate from "@/components/auth/AuthGate";
import AttemptScreen from "@/components/learn/AttemptScreen";
import { PageShell, Spinner } from "@/components/ui";

async function AttemptForRoute({ params }: { params: PageProps<"/learn/attempt/[id]">["params"] }) {
  const { id } = await params;
  return <AttemptScreen key={id} attemptId={id} />;
}

export default function AttemptPage({ params }: PageProps<"/learn/attempt/[id]">) {
  return (
    <AuthGate intro="A grown-up needs to sign in first.">
      <PageShell>
        <Suspense fallback={<Spinner label="Opening your homework…" />}>
          <AttemptForRoute params={params} />
        </Suspense>
      </PageShell>
    </AuthGate>
  );
}
