/** 参考実装（置き換えは不要） */
"use client";
import React, { useEffect, useState } from "react";

export default function VerifySample() {
  const [text, setText] = useState("検証中...");

  useEffect(() => {
    const u = new URL(window.location.href);
    const token = u.searchParams.get("token");
    const email = u.searchParams.get("email");
    (async () => {
      if (!token || !email) return setText("トークンまたはメールが不正です");
      const r = await fetch("/api/account/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email }),
      });
      const d = await r.json();
      setText(r.ok ? "認証完了しました" : d?.error || "検証に失敗しました");
    })();
  }, []);

  return <p>{text}</p>;
}
