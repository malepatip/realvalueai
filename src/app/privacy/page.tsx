import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — RealValue AI",
  description: "How RealValue AI collects, uses, and protects your information.",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "720px",
  margin: "2rem auto",
  padding: "0 1rem",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  lineHeight: 1.6,
  color: "#1a1a1a",
};

export default function PrivacyPolicy(): React.JSX.Element {
  return (
    <main style={containerStyle}>
      <h1>Privacy Policy</h1>
      <p>
        <em>Last updated: April 29, 2026</em>
      </p>

      <p>
        RealValue AI (&quot;RealValue,&quot; &quot;we,&quot; &quot;our,&quot; or
        &quot;us&quot;) provides a chat-first financial assistant that helps
        users monitor their finances, cancel unwanted subscriptions, find
        government benefits, and negotiate bills. This Privacy Policy describes
        what information we collect, how we use it, and the choices you have.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Phone number.</strong> When you sign in via SMS or message us
          on Telegram or WhatsApp, we collect the phone number or platform
          identifier you provide.
        </li>
        <li>
          <strong>Banking and transaction data.</strong> If and only if you
          explicitly link a bank account through Plaid or SimpleFIN, we receive
          your account balances and transaction history through those
          providers&apos; secure APIs. We never see or store your bank login
          credentials.
        </li>
        <li>
          <strong>Messages you send us.</strong> The content of messages you
          send to RealValue through SMS, Telegram, or WhatsApp.
        </li>
        <li>
          <strong>Action history.</strong> Records of actions taken on your
          behalf (such as bill negotiations or subscription cancellations) and
          your approval or rejection of those actions.
        </li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To authenticate you when you sign in (one-time SMS login links).</li>
        <li>
          To detect overdrafts, recurring charges, and savings opportunities in
          the transaction data you have shared.
        </li>
        <li>To respond to your requests and complete actions you approve.</li>
        <li>
          To send transactional messages directly related to your use of the
          service (login links, action confirmations, urgent alerts you have
          opted into).
        </li>
      </ul>

      <h2>What we do not do</h2>
      <ul>
        <li>
          <strong>
            We do not sell your personal information, share it with third
            parties for their own marketing, or use it for marketing or
            advertising.
          </strong>
        </li>
        <li>
          We do not share information collected for the SMS service with third
          parties or affiliates for marketing or promotional purposes.
        </li>
      </ul>

      <h2>Service providers</h2>
      <p>
        We use the following service providers strictly to operate the service.
        They may process limited data on our behalf under contractual
        confidentiality obligations:
      </p>
      <ul>
        <li>
          <strong>Twilio</strong> — SMS delivery for authentication links.
        </li>
        <li>
          <strong>Plaid</strong> and <strong>SimpleFIN</strong> — bank account
          linking and transaction sync (only if you explicitly connect an
          account).
        </li>
        <li>
          <strong>Supabase</strong> — encrypted database hosting.
        </li>
        <li>
          <strong>Vercel</strong> — application hosting.
        </li>
      </ul>

      <h2>Security</h2>
      <p>
        Sensitive credentials you store with us (e.g., to allow agent actions
        on your behalf) are encrypted at rest with AES-256-GCM. All data is
        protected by row-level security at the database tier, and access logs
        are append-only.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        We retain your information while your account is active. You may
        request deletion of your data at any time by contacting us at the
        address below.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>
          Reply <strong>STOP</strong> to any RealValue SMS to immediately opt
          out of further messages.
        </li>
        <li>Reply <strong>HELP</strong> to any RealValue SMS for assistance.</li>
        <li>You may disconnect linked bank accounts at any time.</li>
      </ul>

      <h2>Children</h2>
      <p>
        RealValue is not directed at children under 13, and we do not knowingly
        collect information from children under 13.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this Privacy Policy? Email{" "}
        <a href="mailto:support@realvalue.ai">support@realvalue.ai</a>.
      </p>
    </main>
  );
}
