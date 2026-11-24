"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LOGO_SVG } from "@/lib/belt/logo";

export default function LoginForm({ linkError }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState({ kind: linkError ? "err" : "", text: linkError ? "That sign-in link didn't work. It may have expired, so try again." : "" });
  const [busy, setBusy] = useState(false);
  const supabase = createClient();
  const callback = () => `${window.location.origin}/auth/callback`;

  async function google() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback() },
    });
    if (error) {
      setBusy(false);
      setState({ kind: "err", text: "Google sign-in isn't switched on yet. Use the email link below for now." });
    }
  }

  async function emailLink(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callback(), shouldCreateUser: true },
    });
    setBusy(false);
    if (!error) {
      setState({ kind: "ok", text: `Check your inbox. We've sent a sign-in link to ${email.trim()}.` });
      return;
    }
    const msg = (error.message || "").toLowerCase();
    let text = `Couldn't send the link: ${error.message || "unknown error"}.`;
    if (msg.includes("not authorized") || msg.includes("not authorised"))
      text = "Email sign-in links aren't set up for this address yet. Use Continue with Google, or ask Tom.";
    else if (msg.includes("rate limit") || error.status === 429)
      text = "Too many sign-in emails in the last hour. Wait a few minutes and try again, or use Continue with Google.";
    setState({ kind: "err", text });
  }

  return (
    <main className="login">
      <div className="sbox">
        <span dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />
        <h1>Conveyor Belt</h1>
        <p>Where every Solution Factory initiative is up to, and who has the next step. Sign in with your work Google account.</p>
        {state.text && <div className={`msg ${state.kind === "err" ? "err" : ""}`} role="status">{state.text}</div>}
        <button className="gbtn" type="button" onClick={google} disabled={busy}>
          <i />
          Continue with Google
        </button>
        <div className="or">or</div>
        <form onSubmit={emailLink} style={{ display: "grid", gap: 12 }}>
          <input
            type="email"
            required
            placeholder="Your work email"
            aria-label="Work email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn btn-o" type="submit" disabled={busy} style={{ justifyContent: "center" }}>
            Email me a sign-in link
          </button>
        </form>
        <p className="small">For Local Eyes and Iconic Media Group staff. Not on the list? Ask Tom or Morgan to add you.</p>
      </div>
      <div className="belt-strip" aria-hidden="true" />
    </main>
  );
}
