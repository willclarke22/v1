"use client";
/**
 * V3.7D.2C.5A — Browser Supabase Auth diagnostic ONLY.
 * There are deliberately no PostgREST/table/RPC calls here, and it does not
 * grant access to topics or authorize any MyWay API endpoint.
 * Any future read endpoint MUST authenticate its request server-side and
 * enforce owner-scoped RLS; do not trust this client UI for authorization.
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@supabase/supabase-js";

type Phase = "checking" | "signed_out" | "working" | "signed_in" | "error";

export default function CloudAuthCheck() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const [message, setMessage] = useState("");

  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    try {
      if (new URL(url).protocol !== "https:") return null;
      return createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: "myway-experiment-v37d2c5a-auth",
        },
      });
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!client) {
      setPhase("error");
      setMessage("The sandbox public Auth configuration is unavailable.");
      return;
    }
    let active = true;
    void client.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (!error && data.user) {
        setVerifiedEmail(data.user.email ?? null);
        setPhase("signed_in");
        setMessage("Identity verified with sandbox Supabase Auth.");
      } else {
        setPhase("signed_out");
        setVerifiedEmail(null);
      }
    }).catch(() => {
      if (!active) return;
      setPhase("signed_out");
      setVerifiedEmail(null);
    });
    return () => { active = false; };
  }, [client]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !email.trim() || !password || phase === "working") return;
    setPhase("working");
    setMessage("");
    try {
      const result = await client.auth.signInWithPassword({
        email: email.trim(), password,
      });
      // The password is never written to logs, URL parameters or learner storage.
      setPassword("");
      if (result.error) {
        setPhase("signed_out");
        setMessage("Sign-in failed. Check the password and email verification status.");
        return;
      }
      // Only a fresh network-verified user is reported as authenticated.
      const verified = await client.auth.getUser();
      if (verified.error || !verified.data.user) {
        setPhase("signed_out");
        setMessage("Session created, but server identity verification did not succeed.");
        return;
      }
      setVerifiedEmail(verified.data.user.email ?? null);
      setPhase("signed_in");
      setMessage("Identity verified with sandbox Supabase Auth. Topic access remains disabled.");
    } catch {
      setPassword("");
      setPhase("signed_out");
      setMessage("Could not reach sandbox Supabase Auth.");
    }
  }

  async function handleSignOut() {
    if (!client || phase === "working") return;
    setPhase("working");
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      setVerifiedEmail(null);
      setEmail("");
      setPassword("");
      setMessage("Signed out of the sandbox Auth session.");
      setPhase("signed_out");
    } catch {
      setPhase("error");
      setMessage("Sign-out failed. Close this browser session and retry.");
    }
  }

  return <section className="relative z-10 mx-auto max-w-5xl px-5 pt-6 sm:px-10" aria-labelledby="auth-check-heading">
    <div className="rounded-2xl border border-cyan-400/25 bg-slate-900/95 p-5 text-slate-100 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="auth-check-heading" className="text-lg font-semibold">V3.7D.2C.5A · Sandbox authentication check</h2>
        <span className="rounded-full border border-cyan-300/30 px-3 py-1 text-xs text-cyan-200">AUTH ONLY · NO TOPIC ACCESS</span>
      </div>
      <p className="mt-2 text-sm text-slate-300">This verifies an existing test account using Supabase Auth. It does not read, modify or assign ownership of the 43 existing topics. The 3D Learning Space remains a fictional-data demo.</p>
      {phase === "checking" && <p className="mt-4 text-sm" role="status">Checking existing Auth session…</p>}
      {phase === "signed_in" && <div className="mt-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-emerald-200" role="status">Authenticated{verifiedEmail ? ` as ${verifiedEmail}` : ""} · no database permissions granted</p>
        <button type="button" onClick={() => void handleSignOut()} className="rounded-lg border border-slate-500 px-3 py-2 text-sm hover:bg-white/10">Sign out</button>
      </div>}
      {(phase === "signed_out" || (phase === "working" && !verifiedEmail)) && <form onSubmit={(event) => void handleSignIn(event)} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[210px] flex-1 flex-col gap-1 text-xs">Test account email
          <input autoComplete="username" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border border-slate-500/60 bg-slate-950 px-3 py-2 text-sm text-white" />
        </label>
        <label className="flex min-w-[210px] flex-1 flex-col gap-1 text-xs">Password
          <input autoComplete="current-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-lg border border-slate-500/60 bg-slate-950 px-3 py-2 text-sm text-white" />
        </label>
        <button type="submit" disabled={phase === "working"} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{phase === "working" ? "Verifying…" : "Sign in"}</button>
      </form>}
      {phase === "working" && verifiedEmail && <p className="mt-4 text-sm" role="status">Signing out…</p>}
      {message && <p className="mt-3 text-sm text-slate-300" role="status">{message}</p>}
      <p className="mt-3 text-xs text-slate-400">Use only the isolated myway_sandbox test account. Auth sessions may persist in this browser; sign out on shared devices. No public sign-up form is included.</p>
    </div>
  </section>;
}
