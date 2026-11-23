import { NextResponse } from "next/server";
import { requireBot } from "@/lib/bot";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";

export async function POST() {
  const { supabase, user, bot } = await requireBot();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("bot_id", bot.id)
    .maybeSingle();

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: env.stripePriceIdPro, quantity: 1 }],
    client_reference_id: bot.id,
    ...(sub?.stripe_customer_id ? { customer: sub.stripe_customer_id } : { customer_email: user.email }),
    subscription_data: { metadata: { bot_id: bot.id } },
    metadata: { bot_id: bot.id },
    locale: "zh-TW",
    success_url: `${env.appUrl}/dashboard/billing?success=1`,
    cancel_url: `${env.appUrl}/dashboard/billing`,
  });
  return NextResponse.redirect(session.url!, 303);
}
