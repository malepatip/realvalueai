"use client";

import { useState } from "react";

/**
 * Magic link login page.
 * Simple form with phone number input that calls POST /api/auth/magic-link.
 */
export default function LoginPage(): React.JSX.Element {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });

      const data = (await res.json()) as { success: boolean; error?: string };

      if (data.success) {
        setSubmitted(true);
      } else {
        setError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div style={{ maxWidth: 400, margin: "4rem auto", textAlign: "center" }}>
        <h1>Check your phone</h1>
        <p>We sent a login link to {phoneNumber}. It expires in 15 minutes.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: "4rem auto" }}>
      <h1>Log in to RealValue</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="phoneNumber" style={{ display: "block", marginBottom: "0.5rem" }}>
          Phone number
        </label>
        <input
          id="phoneNumber"
          type="tel"
          placeholder="+14155551234"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          required
          style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem" }}
          aria-describedby="phone-help"
        />
        <p id="phone-help" style={{ fontSize: "0.85rem", color: "#666", marginTop: 0 }}>
          Enter your phone number in international format (e.g., +14155551234)
        </p>
        {error && (
          <p role="alert" style={{ color: "red", marginBottom: "1rem" }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{ width: "100%", padding: "0.75rem", cursor: loading ? "wait" : "pointer" }}
        >
          {loading ? "Sending…" : "Send login link"}
        </button>
      </form>
    </div>
  );
}
