import type { NextConfig } from 'next';

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  experimental: {
    // Tab switches reuse a page's client-side copy for this many seconds (Next's default is 300),
    // so a home-screen app picks up new tasks soon after switching back to a tab.
    staleTimes: { static: 30 },
  },
  images: {
    remotePatterns: supabaseHostname
      ? [{ protocol: 'https', hostname: supabaseHostname, pathname: '/storage/v1/object/public/**' }]
      : [],
  },
  async headers() {
    return [
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          // Vercel's default HSTS header omits includeSubDomains/preload. Adding both is
          // required for hstspreload.org submission -- once a browser has this domain
          // preloaded, it refuses to let a user click through a certificate error at all,
          // closing the network-interception window a first-time visitor is otherwise
          // exposed to before any HSTS policy has been cached from a prior visit.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

export default nextConfig;
