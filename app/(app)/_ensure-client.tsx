// app/(app)/_ensure-client.tsx
'use client'

import { useEffect } from 'react'

export default function EnsureClient() {
  // 何もしないが、(app) セグメントに確実にクライアント境界を生やす
  useEffect(() => {}, [])
  return <span data-ensure-client="(app)" style={{ display: 'none' }} />
}
