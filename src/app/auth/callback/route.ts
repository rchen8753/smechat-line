import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google 登入與 Email 驗證信的回呼：以 code 換取 session
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/dashboard"}`);
  }
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("登入失敗，請再試一次")}`);
}
