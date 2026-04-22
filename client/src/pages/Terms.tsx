import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function Terms() {
  return (
    <div className="min-h-screen bg-[#08080F] text-[#F0F0F5]">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/">
          <span className="inline-flex items-center gap-2 text-sm text-[#9494B8] hover:text-[#F0F0F5] transition-colors cursor-pointer mb-8">
            <ArrowLeft size={16} /> Back to home
          </span>
        </Link>

        <h1 className="font-display text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-[#5C5C7A] mb-10">Last updated: April 2026</p>

        <div className="space-y-8 text-sm text-[#9494B8] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Awakli ("the Service"), you agree to be bound by these Terms of Service.
              If you do not agree to these terms, please do not use the Service. We reserve the right to
              update these terms at any time, and continued use constitutes acceptance of any changes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">2. Description of Service</h2>
            <p>
              Awakli is an AI-powered platform for creating manga and anime content. The Service includes
              text-to-manga generation, character consistency tools, video animation, and related creative
              tools. Features may vary by subscription tier.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">3. User Accounts</h2>
            <p>
              You must create an account to access certain features. You are responsible for maintaining
              the security of your account credentials. You must be at least 13 years old to use the Service.
              Accounts are personal and may not be shared or transferred.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">4. Content & Intellectual Property</h2>
            <p>
              Content you create using Awakli belongs to you, subject to the underlying AI model licenses.
              You grant Awakli a non-exclusive license to host and display your content as necessary to
              provide the Service. You may not use the Service to generate content that infringes on
              third-party intellectual property rights.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">5. Subscriptions & Payments</h2>
            <p>
              Paid subscriptions are billed monthly or annually. Credits are granted at the start of each
              billing period. Unused credits may roll over based on your tier's rollover policy. Prices
              are subject to change with 30 days' notice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">6. Refund Policy</h2>
            <p>
              We offer a 14-day no-questions-asked refund on subscription payments. Credit packs are
              refundable only for unused credits — consumed credits are non-refundable. Refunds are
              processed to the original payment method within 5-10 business days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">7. Acceptable Use</h2>
            <p>
              You may not use the Service to generate illegal, harmful, or abusive content. This includes
              but is not limited to: content depicting minors inappropriately, hate speech, harassment,
              or content that violates applicable laws. We reserve the right to suspend accounts that
              violate these guidelines.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">8. Limitation of Liability</h2>
            <p>
              The Service is provided "as is" without warranties of any kind. Awakli shall not be liable
              for any indirect, incidental, or consequential damages arising from your use of the Service.
              Our total liability shall not exceed the amount you paid in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">9. Termination</h2>
            <p>
              Either party may terminate the agreement at any time. Upon termination, your right to use
              the Service ceases immediately. We may retain your data for a reasonable period to comply
              with legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">10. Contact</h2>
            <p>
              For questions about these terms, please contact us at{" "}
              <a href="mailto:legal@awakli.ai" className="text-[#E040FB] hover:text-[#EA80FC]">legal@awakli.ai</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
