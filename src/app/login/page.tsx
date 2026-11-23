"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/browser";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(params.get("error"));

  const supabase = createClient();
  const callbackUrl = () => `${window.location.origin}/auth/callback`;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError("登入失敗：帳號或密碼錯誤");
      else router.push("/dashboard");
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callbackUrl() },
      });
      if (error) setError("註冊失敗：" + error.message);
      else if (data.session) router.push("/dashboard");
      else setMessage("已寄出驗證信，請至信箱點擊連結完成註冊。");
    }
    setLoading(false);
  }

  async function google() {
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl() } });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="h1 mb-6 text-center">{mode === "signin" ? "登入" : "建立帳號"}</h1>
      <div className="card space-y-4">
        <button onClick={google} className="btn-secondary w-full">使用 Google 帳號繼續</button>
        <div className="muted text-center">或使用 Email</div>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="password">密碼</label>
            <input id="password" type="password" required minLength={8} className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-emerald-700">{message}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "處理中…" : mode === "signin" ? "登入" : "註冊"}
          </button>
        </form>
        <button
          type="button"
          className="w-full text-center text-sm text-emerald-700 hover:underline"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "還沒有帳號？立即註冊" : "已有帳號？登入"}
        </button>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
