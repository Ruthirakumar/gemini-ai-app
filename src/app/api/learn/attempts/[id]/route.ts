import { NextRequest } from "next/server";
import { assertUuid, ok, route } from "@/lib/api";
import { getAttemptView } from "@/lib/learn/repository";
import { requireUser } from "@/lib/supabase/server";

/** GET – the attempt with its questions (no answer keys) and saved answers; results once marked. */
export const GET = route("learn/attempt", async (_request: NextRequest, ctx: RouteContext<"/api/learn/attempts/[id]">) => {
  const id = assertUuid((await ctx.params).id, "attempt");
  const { supabase } = await requireUser();
  const attempt = await getAttemptView(supabase, id);
  return ok({ attempt });
});
