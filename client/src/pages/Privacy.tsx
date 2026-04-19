import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#08080F] text-[#F0F0F5]">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/">
          <span className="inline-flex items-center gap-2 text-sm text-[#9494B8] hover:text-[#F0F0F5] transition-colors cursor-pointer mb-8">
            <ArrowLeft size={16} /> Back to home
          </span>
        </Link>

        <h1 className="font-display text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-[#5C5C7A] mb-10">Last updated: April 2026</p>

        <div className="space-y-8 text-sm text-[#9494B8] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">1. Information We Collect</h2>
            <p>
              We collect information you provide directly: account details (name, email via OAuth),
              content you create, and usage preferences. We automatically collect: device information,
              IP address, browser type, and usage analytics. We do not collect passwords — authentication
              is handled via secure OAuth providers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">2. How We Use Your Information</h2>
            <p>
              We use your information to: provide and improve the Service, process payments, communicate
              updates, ensure security, and comply with legal obligations. We use anonymized usage data
              to improve our AI models and service quality.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">3. Data Storage & Security</h2>
            <p>
              Your data is stored on secure cloud infrastructure with encryption at rest and in transit.
              Generated content is stored in S3-compatible storage. We implement industry-standard security
              measures including AES-256 encryption for sensitive data and secure session management.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">4. Third-Party Services</h2>
            <p>
              We use third-party services for: payment processing (Stripe), AI image generation
              (various providers), authentication (OAuth), and analytics. Each provider has their own
              privacy policy. We share only the minimum data necessary for each service to function.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">5. Your Content</h2>
            <p>
              Content you generate belongs to you. We do not use your private content to train AI models
              without explicit consent. You can export or delete your content at any time through your
              account settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">6. Cookies & Tracking</h2>
            <p>
              We use essential cookies for authentication and session management. We use analytics cookies
              to understand usage patterns. You can control cookie preferences through your browser settings.
              We do not sell your data to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">7. Data Retention</h2>
            <p>
              We retain your account data for as long as your account is active. Generated content is
              retained until you delete it or close your account. After account deletion, we remove
              personal data within 30 days, except where retention is required by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">8. Your Rights</h2>
            <p>
              You have the right to: access your personal data, correct inaccurate data, delete your
              data, export your data, and opt out of marketing communications. To exercise these rights,
              contact us at the address below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">9. Children's Privacy</h2>
            <p>
              The Service is not intended for children under 13. We do not knowingly collect personal
              information from children under 13. If we become aware of such collection, we will delete
              the information promptly.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F0F0F5] mb-3">10. Contact</h2>
            <p>
              For privacy-related inquiries, please contact us at{" "}
              <a href="mailto:privacy@awakli.ai" className="text-[#00D4FF] hover:text-[#33DFFF]">privacy@awakli.ai</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
