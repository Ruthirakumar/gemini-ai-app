import AuthGate from "@/components/auth/AuthGate";
import UploadHomework from "@/components/library/UploadHomework";
import { PageShell } from "@/components/ui";

export default function NewHomeworkPage() {
  return (
    <AuthGate intro="Sign in to upload homework.">
      <PageShell>
        <UploadHomework />
      </PageShell>
    </AuthGate>
  );
}
