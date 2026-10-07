// app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
import { themeInitScript } from '@/lib/theme'

export const metadata: Metadata = { title: 'Recepita', description: 'Expense manager' }

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
  )
}
