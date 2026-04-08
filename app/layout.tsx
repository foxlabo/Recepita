// app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
import ClientBoot from '@/components/ClientBoot'

export const metadata: Metadata = { title: 'Recepita', description: 'Expense manager' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body>
        <ClientBoot /> {/* ここでクライアント境界が張られる */}
        {children}
      </body>
    </html>
  )
}
