import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    // proxy.ts runs for /api/ocr, and Next buffers request bodies for the proxy
    // only up to this size (default 10 MB, silently truncating the rest). Keep
    // it above the OCR route's own limit (10 MB file + multipart overhead) so
    // that route can reject oversized uploads itself with 413.
    proxyClientMaxBodySize: '11mb',
  },
}

export default nextConfig
