import AuthGate from "@/components/auth/AuthGate";
import LearnDashboard from "@/components/learn/LearnDashboard";
import { PageShell } from "@/components/ui";

export default function LearnPage() {
  return (
    <AuthGate intro="A grown-up needs to sign in first.">
      <PageShell>
        <LearnDashboard />
      </PageShell>
    </AuthGate>
  );
}
