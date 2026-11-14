import { Suspense } from "react";
import AuthGate from "@/components/auth/AuthGate";
import HomeworkEditor from "@/components/library/HomeworkEditor";
import { PageShell, Spinner } from "@/components/ui";

async function EditorForRoute({ params }: { params: PageProps<"/library/[id]">["params"] }) {
  const { id } = await params;
  return <HomeworkEditor key={id} setId={id} />;
}

export default function HomeworkReviewPage({ params }: PageProps<"/library/[id]">) {
  return (
    <AuthGate intro="Sign in to review this homework.">
      <PageShell wide>
        <Suspense fallback={<Spinner label="Loading homework…" />}>
          <EditorForRoute params={params} />
        </Suspense>
      </PageShell>
    </AuthGate>
  );
}
