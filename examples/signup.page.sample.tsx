/** 参考実装（置き換えは不要） */
"use client";
import React, { useState } from "react";

export default function SignupSample() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null); setMsg(null);
    try {
      const r = await fetch("/api/account/email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "送信失敗");
      setMsg("認証メールを送信しました。受信トレイをご確認ください。");
    } catch (e: any) {
      setErr(e.message || "失敗しました");
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={onSend}>
      <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
      <button disabled={loading}>{loading ? "送信中..." : "確認メールを送る"}</button>
      {msg && <p>{msg}</p>}
      {err && <p>{err}</p>}
    </form>
  );
}
