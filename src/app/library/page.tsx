import AuthGate from "@/components/auth/AuthGate";
import LibraryList from "@/components/library/LibraryList";
import { PageShell } from "@/components/ui";

export default function LibraryPage() {
  return (
    <AuthGate intro="Sign in to manage your homework library.">
      <PageShell wide>
        <LibraryList />
      </PageShell>
    </AuthGate>
  );
}
