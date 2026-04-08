import nodemailer from "nodemailer";
import { getBaseUrl } from "./url"; 

// Nodemailer トランスポート設定
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// 汎用メール送信
export async function sendMail(to: string, subject: string, html: string) {
  const from = process.env.SMTP_FROM || "no-reply@example.com";
  await transporter.sendMail({ from, to, subject, html });
}

// メール認証専用の送信関数
export async function sendVerificationMail(email: string, token: string) {
  const base = getBaseUrl(); // ローカル or 本番 自動判定
  const verifyUrl = new URL("/api/account/email/verify", base);
  verifyUrl.searchParams.set("token", token);

  const html = `
    <p>メールアドレス確認のため、以下のリンクをクリックしてください。</p>
    <p><a href="${verifyUrl.toString()}">${verifyUrl.toString()}</a></p>
    <p>このリンクは一定時間後に無効になります。</p>
  `;

  await sendMail(email, "Recepita メール確認", html);
}
