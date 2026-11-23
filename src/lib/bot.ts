import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const BOT_COLUMNS =
  "id, business_name, custom_instructions, handoff_email, line_bot_name, line_basic_id, line_token_verified_at, line_webhook_verified_at";

// 取得目前登入的使用者與其機器人；未登入則導向登入頁。
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function getBot() {
  const { supabase, user } = await requireUser();
  const { data: bot } = await supabase.from("bots").select(BOT_COLUMNS).eq("owner_id", user.id).maybeSingle();
  return { supabase, user, bot };
}

export async function requireBot() {
  const ctx = await getBot();
  if (!ctx.bot) redirect("/dashboard");
  return { ...ctx, bot: ctx.bot };
}
