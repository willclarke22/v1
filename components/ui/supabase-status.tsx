"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function SupabaseStatus() {
  const [status, setStatus] = useState("Checking Supabase...");

  useEffect(() => {
    async function checkConnection() {
      try {
        const { error } = await supabase.auth.getSession();

        if (error) {
          setStatus("Supabase connected, but returned an auth error.");
          return;
        }

        setStatus("Supabase connected successfully.");
      } catch {
        setStatus("Could not connect to Supabase.");
      }
    }

    checkConnection();
  }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-300">
      {status}
    </div>
  );
}