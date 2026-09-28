import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Root cause of "Catalog/Purchase Order/Reports API responses don't show
  // up" reported while debugging: Next.js dev server's Turbopack HMR
  // websocket and _next/static chunk requests are rejected (403 / failed
  // WS handshake) when the browser's Origin isn't in this allowlist -- by
  // default that's just "localhost". This project's own backend CORS
  // config (asset_backend/settings.py CORS_ALLOWED_ORIGINS) already
  // expects the frontend to be reachable via 127.0.0.1 and the LAN IP too
  // (matching the "Local"/"Network" URLs `next dev` itself prints), so
  // allow those origins here as well -- without this, hydration/HMR can
  // silently fail for anyone opening the app via 127.0.0.1 or the LAN IP
  // instead of localhost, which stops React from ever attaching its event
  // handlers (no click ever reaches an onClick, so no API call is ever
  // made -- this looked like a missing/broken API response but only ever
  // was an unhydrated page).
  allowedDevOrigins: ["127.0.0.1", "192.168.0.168"],
};

export default nextConfig;
