"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/");
    } else {
      setError(true);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-xs">
        <h1 className="font-serif text-3xl mb-8 text-center tracking-tight">
          catchup
        </h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          autoFocus
          className="w-full bg-bg-raised border border-border rounded-lg px-4 py-3 text-sm
            text-text placeholder:text-text-tertiary outline-none
            focus:border-accent/50 transition-colors"
        />
        {error && (
          <p className="text-sm text-red-400 mt-2">wrong password</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full mt-4 bg-bg-raised border border-border rounded-lg px-4 py-3
            text-sm text-text-secondary hover:text-text hover:border-accent/30
            transition-all disabled:opacity-50"
        >
          {loading ? "..." : "enter"}
        </button>
      </form>
    </div>
  );
}
