import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // Framing/base/plugin restrictions only: no script-src, so Next.js inline
  // bootstrap scripts keep working.
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  // Receipts are picked with <input type="file">, which needs no camera
  // permission, so powerful features are disabled outright.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
];

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  experimental: {
    // proxy.ts runs for /api/ocr, and Next buffers request bodies for the proxy
    // only up to this size (default 10 MB, silently truncating the rest). Keep
    // it above the OCR route's own limit (10 MB file + multipart overhead) so
    // that route can reject oversized uploads itself with 413.
    proxyClientMaxBodySize: '11mb',
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
