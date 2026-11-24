"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LOGO_SVG } from "@/lib/belt/logo";

// Google sign-in waits for IT approval. Set NEXT_PUBLIC_GOOGLE_SIGNIN=on in Vercel to show it.
const GOOGLE_ON = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === "on";

function friendly(error) {
  const msg = (error?.message || "").toLowerCase();
  if (msg.includes("invalid login credentials")) return "That email and password don't match. First time here? Choose \"Set up my password\".";
  if (msg.includes("already registered") || msg.includes("already exists")) return "You've already set a password. Sign in instead.";
  if (msg.includes("password") && (msg.includes("at least") || msg.includes("short") || msg.includes("weak"))) return "Pick a longer password: at least 8 characters.";
  if (msg.includes("email not confirmed")) return "Your account needs confirming. Ask Tom to turn off email confirmation in Supabase.";
  if (msg.includes("rate limit") || error?.status === 429) return "Too many attempts. Wait a few minutes and try again.";
  return `Something went wrong: ${error?.message || "unknown error"}.`;
}

export default function LoginForm({ linkError }) {
  const router = useRouter();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState(
    linkError ? { kind: "err", text: "That sign-in didn't work. Try again." } : { kind: "", text: "" }
  );
  const [busy, setBusy] = useState(false);
  const supabase = createClient();

  async function google() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setBusy(false);
      setState({ kind: "err", text: friendly(error) });
    }
  }

  async function submit(e) {
    e.preventDefault();
    const em = email.trim();
    if (!em || !password) return;
    if (mode === "setup" && password.length < 8) {
      setState({ kind: "err", text: "Pick a longer password: at least 8 characters." });
      return;
    }
    setBusy(true);
    setState({ kind: "", text: "" });
    const { data, error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email: em, password })
        : await supabase.auth.signUp({ email: em, password });
    if (error) {
      setBusy(false);
      setState({ kind: "err", text: friendly(error) });
      return;
    }
    if (mode === "setup" && !data.session) {
      setBusy(false);
      setState({ kind: "err", text: "Account created, but Supabase wants to confirm it by email. Ask Tom to turn off email confirmation, then sign in." });
      return;
    }
    router.replace("/");
    router.refresh();
  }

  const setup = mode === "setup";

  return (
    <main className="login">
      <div className="sbox">
        <span dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />
        <h1>Conveyor Belt</h1>
        <p>
          {setup
            ? "First time here? Use your work email and choose a password. You'll use these to sign in from now on."
            : "Where every Solution Factory initiative is up to, and who has the next step."}
        </p>
        {state.text && (
          <div className={`msg ${state.kind === "err" ? "err" : ""}`} role="status">
            {state.text}
          </div>
        )}
        {GOOGLE_ON && (
          <>
            <button className="gbtn" type="button" onClick={google} disabled={busy}>
              <i />
              Continue with Google
            </button>
            <div className="or">or</div>
          </>
        )}
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Your work email"
            aria-label="Work email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            required
            minLength={setup ? 8 : undefined}
            autoComplete={setup ? "new-password" : "current-password"}
            placeholder={setup ? "Choose a password (8+ characters)" : "Password"}
            aria-label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn btn-o" type="submit" disabled={busy} style={{ justifyContent: "center" }}>
            {busy ? "One moment…" : setup ? "Set up my password" : "Sign in"}
          </button>
        </form>
        <button
          type="button"
          className="signout"
          style={{ padding: 0, justifySelf: "start" }}
          onClick={() => {
            setMode(setup ? "signin" : "setup");
            setState({ kind: "", text: "" });
          }}
        >
          {setup ? "Already set a password? Sign in" : "First time here? Set up my password"}
        </button>
        <p className="small">
          For Local Eyes and Iconic Media Group staff. You need to be on the People list first: ask Tom or Morgan. Forgotten
          your password? Ask Tom to reset your account.
        </p>
      </div>
      <div className="belt-strip" aria-hidden="true" />
    </main>
  );
}
