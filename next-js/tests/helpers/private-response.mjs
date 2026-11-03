/** Explicit private-response coverage shared by the HTTP and discovery regression checks. */
export const privateResponseSources = Object.freeze([
  '/analytics', '/api/analytics/:path*', '/admin', '/admin/:path*', '/api/admin/:path*',
  '/en/account', '/en/subscribe', '/en/best-slips/:path*', '/api/account/:path*', '/api/slips/:path*',
  '/r/:path*', '/s/:path*', '/payment-review/:path*',
]);
