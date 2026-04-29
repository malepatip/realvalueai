import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms and SMS Conditions — RealValue AI",
  description:
    "Terms and conditions for the RealValue AI service, including SMS messaging program details.",
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

export default function Terms(): React.JSX.Element {
  return (
    <main style={containerStyle}>
      <h1>Terms and SMS Conditions</h1>
      <p>
        <em>Last updated: April 29, 2026</em>
      </p>

      <p>
        These Terms govern your use of RealValue AI (&quot;RealValue,&quot;
        &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;), a chat-first
        financial assistant. By using the service you agree to these Terms.
      </p>

      <h2>The service</h2>
      <p>
        RealValue helps you monitor your finances, cancel unwanted
        subscriptions, find government benefits you may qualify for, and
        negotiate bills. The service is delivered through SMS, Telegram, and
        WhatsApp. RealValue does not lend money and is not a financial
        institution.
      </p>

      <h2>SMS messaging program</h2>

      <h3>Program name</h3>
      <p>RealValue AI Login &amp; Account Notifications.</p>

      <h3>Program description</h3>
      <p>
        We send transactional SMS messages to phone numbers that users
        themselves have entered on our sign-in page or have associated with
        their RealValue account. SMS is used for one-time login links (magic
        links), action confirmations, and urgent account alerts that you have
        opted into. We do not send marketing or promotional SMS.
      </p>

      <h3>Message frequency</h3>
      <p>
        Message frequency varies. You will receive a login SMS each time you
        request one from the sign-in page. Optional account notifications
        (e.g., overdraft warnings, action confirmations) are sent based on the
        events occurring in your account, typically 0–5 messages per week.
      </p>

      <h3>Message and data rates</h3>
      <p>
        <strong>Message and data rates may apply.</strong> Your mobile carrier
        may charge you for sending or receiving SMS based on your plan.
        RealValue does not charge a fee for the SMS itself.
      </p>

      <h3>Help</h3>
      <p>
        Reply <strong>HELP</strong> to any RealValue SMS to receive help
        information, or email{" "}
        <a href="mailto:support@realvalue.ai">support@realvalue.ai</a>.
      </p>

      <h3>Opting out</h3>
      <p>
        You can opt out of RealValue SMS at any time by replying{" "}
        <strong>STOP</strong> to any message we send. You may also reply{" "}
        <strong>END</strong>, <strong>CANCEL</strong>,{" "}
        <strong>UNSUBSCRIBE</strong>, or <strong>QUIT</strong>. After we
        receive your opt-out request, we will send a single confirmation
        message and will not send further SMS to that number unless you opt in
        again.
      </p>

      <h3>Carrier disclaimer</h3>
      <p>
        Carriers (including but not limited to AT&amp;T, T-Mobile, Verizon, and
        their affiliates) are not liable for delayed or undelivered messages.
        Delivery is not guaranteed and depends on factors outside our control.
      </p>

      <h3>Supported carriers</h3>
      <p>
        Major U.S. mobile carriers, including AT&amp;T, T-Mobile, Verizon,
        Sprint, U.S. Cellular, and most regional carriers.
      </p>

      <h2>Eligibility</h2>
      <p>
        You must be at least 18 years old and a U.S. resident to use RealValue.
      </p>

      <h2>No warranty</h2>
      <p>
        The service is provided &quot;as is&quot; without warranties of any
        kind. While we work to surface accurate information about your
        finances, we cannot guarantee outcomes (e.g., that a bill negotiation
        will succeed or that you qualify for a particular benefit).
      </p>

      <h2>Privacy</h2>
      <p>
        Our handling of your information is described in the{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>Contact</h2>
      <p>
        Email <a href="mailto:support@realvalue.ai">support@realvalue.ai</a>.
      </p>
    </main>
  );
}
