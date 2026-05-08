import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ResolveLoginIdentifierSchema = z.object({
  identifier: z.string().trim().min(1).max(128),
});

const USERNAME_DOMAIN = "drivecore.local";

export const resolveLoginIdentifier = createServerFn({ method: "POST" })
  .inputValidator((data) => ResolveLoginIdentifierSchema.parse(data))
  .handler(async ({ data }) => {
    const identifier = data.identifier.trim();

    if (identifier.includes("@")) {
      return { email: identifier.toLowerCase() };
    }

    const normalized = identifier.toLowerCase();

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name")
      .ilike("display_name", normalized)
      .limit(1)
      .maybeSingle();

    if (profileError) {
      throw new Error("Could not verify account details.");
    }

    if (profile?.id) {
      const { data: userResult, error: userError } = await supabaseAdmin.auth.admin.getUserById(profile.id);
      if (!userError && userResult.user?.email) {
        return { email: userResult.user.email.toLowerCase() };
      }
    }

    return { email: `${normalized}@${USERNAME_DOMAIN}` };
  });