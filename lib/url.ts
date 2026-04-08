// lib/url.ts
export function getBaseUrl() {
  // 優先順で環境を自動検出
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.WEBSITE_HOSTNAME
      ? `https://${process.env.WEBSITE_HOSTNAME}`
      : `http://localhost:3000`); // ← ローカルfallback

  return envUrl.replace(/\/+$/, '');
}