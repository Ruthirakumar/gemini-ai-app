import { ok, route } from "@/lib/api";
import { requireViewer } from "@/lib/supabase/server";

/** GET – who is signed in and whether they can manage the shared library. */
export const GET = route("me", async () => {
  const { userId, isAdmin } = await requireViewer();
  return ok({ userId, isAdmin });
});
