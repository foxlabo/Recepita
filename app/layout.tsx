// app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Recepita', description: 'Expense manager' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
