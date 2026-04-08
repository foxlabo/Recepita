// components/ClientBoot.tsx
'use client'
import { useEffect } from 'react'

export default function ClientBoot() {
  // DOMを必ず1要素出す（null だと最適化で消える可能性）
  useEffect(() => {
    // なんでもOK。副作用があるとツリーシェイク対象から外れる
    // console.log で十分
    // eslint-disable-next-line no-console
    console.log('ClientBoot mounted')
  }, [])
  return <span data-client-boot="1" style={{ display: 'none' }} />
}
