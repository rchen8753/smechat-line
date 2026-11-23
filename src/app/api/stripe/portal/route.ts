import { NextResponse } from "next/server";
import { requireBot } from "@/lib/bot";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";

export async function POST() {
  const { supabase, bot } = await requireBot();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("bot_id", bot.id)
    .maybeSingle();
  if (!sub?.stripe_customer_id) return NextResponse.redirect(`${env.appUrl}/dashboard/billing`, 303);

  const session = await stripe().billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    locale: "zh-TW",
    return_url: `${env.appUrl}/dashboard/billing`,
  });
  return NextResponse.redirect(session.url, 303);
}
