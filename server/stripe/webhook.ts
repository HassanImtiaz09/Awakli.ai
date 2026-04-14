import { Request, Response } from "express";
import { getStripe } from "./client";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { subscriptions } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import type { TierKey } from "./products";

export async function handleStripeWebhook(req: Request, res: Response) {
  const stripe = getStripe();
  const sig = req.headers["stripe-signature"] as string;

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      ENV.stripeWebhookSecret
    );
  } catch (err: any) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle test events
  if (event.id.startsWith("evt_test_")) {
    console.log("[Webhook] Test event detected, returning verification response");
    return res.json({ verified: true });
  }

  console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;
        const userId = parseInt(session.metadata?.user_id || session.client_reference_id || "0");
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (userId && subscriptionId) {
          const db = await getDb();
          if (db) {
            // Fetch subscription details from Stripe
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            const priceId = sub.items.data[0]?.price?.id;
            const interval = sub.items.data[0]?.price?.recurring?.interval;

            // Determine tier from metadata or price
            const tier = (session.metadata?.tier || "pro") as TierKey;

            // Upsert subscription record
            const existing = await db.select().from(subscriptions)
              .where(eq(subscriptions.userId, userId)).limit(1);

            if (existing.length > 0) {
              await db.update(subscriptions).set({
                tier,
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscriptionId,
                status: "active",
                billingInterval: interval === "year" ? "annual" : "monthly",
                currentPeriodStart: new Date((sub as any).current_period_start * 1000),
                currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
              }).where(eq(subscriptions.userId, userId));
            } else {
              await db.insert(subscriptions).values({
                userId,
                tier,
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscriptionId,
                status: "active",
                billingInterval: interval === "year" ? "annual" : "monthly",
                currentPeriodStart: new Date((sub as any).current_period_start * 1000),
                currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
              });
            }
            console.log(`[Stripe Webhook] Subscription activated for user ${userId}: ${tier}`);
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as any;
        const db = await getDb();
        if (db) {
          const subId = sub.id as string;
          const status = sub.status;
          const cancelAtPeriodEnd = sub.cancel_at_period_end ? 1 : 0;

          await db.update(subscriptions).set({
            status: status === "active" ? "active" :
                    status === "past_due" ? "past_due" :
                    status === "canceled" ? "canceled" :
                    status === "trialing" ? "trialing" : "incomplete",
            cancelAtPeriodEnd,
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          }).where(eq(subscriptions.stripeSubscriptionId, subId));
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as any;
        const db = await getDb();
        if (db) {
          await db.update(subscriptions).set({
            tier: "free",
            status: "canceled",
            stripeSubscriptionId: null,
          }).where(eq(subscriptions.stripeSubscriptionId, sub.id));
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        const db = await getDb();
        if (db && invoice.subscription) {
          await db.update(subscriptions).set({
            status: "past_due",
          }).where(eq(subscriptions.stripeSubscriptionId, invoice.subscription));
        }
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err: any) {
    console.error(`[Stripe Webhook] Error processing ${event.type}:`, err.message);
  }

  res.json({ received: true });
}
