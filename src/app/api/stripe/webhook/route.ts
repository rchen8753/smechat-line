import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, request.headers.get("stripe-signature") ?? "", env.stripeWebhookSecret);
  } catch {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  const admin = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const botId = session.client_reference_id ?? session.metadata?.bot_id;
      if (!botId || !session.subscription) break;
      const subscription = await stripe().subscriptions.retrieve(session.subscription as string);
      await saveSubscription(admin, botId, subscription);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const botId = subscription.metadata?.bot_id;
      if (botId) await saveSubscription(admin, botId, subscription);
      break;
    }
  }
  return NextResponse.json({ received: true });
}

async function saveSubscription(admin: ReturnType<typeof createAdminClient>, botId: string, s: Stripe.Subscription) {
  const { error } = await admin.from("subscriptions").upsert({
    bot_id: botId,
    plan: s.status === "canceled" ? "free" : "pro",
    status: s.status,
    stripe_customer_id: typeof s.customer === "string" ? s.customer : s.customer.id,
    stripe_subscription_id: s.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
