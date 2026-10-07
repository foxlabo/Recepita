// app/layout.tsx
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { themeInitScript } from '@/lib/theme';

// Favicon: app/icon.png (file convention, linked automatically).
export const metadata: Metadata = {
  title: { default: 'Recepita', template: '%s | Recepita' },
  description: 'レシートや請求書を読み取って、個人事業主・フリーランスの経費と売上をまとめて管理できるアプリです。',
  applicationName: 'Recepita',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#16a34a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // the inline script adds class="dark" before hydration → suppressHydrationWarning
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* テーマを描画前に適用（ライト→ダークのちらつき防止） */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
