import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function Refund() {
  return (
    <div className="min-h-screen bg-[#08080F] text-[#F0F0F5]">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/">
          <span className="inline-flex items-center gap-2 text-sm text-[#9494B8] hover:text-[#F0F0F5] transition-colors cursor-pointer mb-8">
            <ArrowLeft size={16} /> Back to home
          </span>
        </Link>

        <h1 className="font-display text-3xl font-bold mb-2">Refund Policy</h1>
        <p className="text-sm text-[#5C5C7A] mb-10">Last updated: April 2026</p>

        <div className="space-y-8 text-sm text-[#9494B8] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">Subscription Refunds</h2>
            <p>
              We offer a <strong className="text-[#F0F0F5]">14-day no-questions-asked refund</strong> on
              all subscription payments. If you're not satisfied with the Service within the first 14 days
              of your subscription, contact us for a full refund.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">Credit Pack Refunds</h2>
            <p>
              Credit packs are refundable on a proportional basis. If you have unused credits remaining
              from a credit pack purchase, you may request a refund for the unused portion. Credits that
              have already been consumed (used for generation) are non-refundable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">How Refunds Work</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>Refunds are processed to the original payment method</li>
              <li>Processing typically takes 5-10 business days</li>
              <li>When a refund is issued, corresponding credits are proportionally revoked</li>
              <li>Active subscriptions are canceled upon refund</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">Exceptions</h2>
            <p>
              Refunds may not be available for: accounts suspended for Terms of Service violations,
              chargebacks already in dispute, or purchases made more than 60 days ago.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">How to Request a Refund</h2>
            <p>
              To request a refund, email{" "}
              <a href="mailto:support@awakli.ai" className="text-[#00D4FF] hover:text-[#33DFFF]">support@awakli.ai</a>{" "}
              with your account email and reason for the refund. We aim to respond within 24 hours.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
