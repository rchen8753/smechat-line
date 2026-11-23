import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";

let client: Stripe | null = null;
export const stripe = () => (client ??= new Stripe(env.stripeSecretKey));
