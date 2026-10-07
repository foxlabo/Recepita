import type { Metadata } from 'next'

// page.tsx is a client component, so the page title is set here.
export const metadata: Metadata = { title: '設定' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
