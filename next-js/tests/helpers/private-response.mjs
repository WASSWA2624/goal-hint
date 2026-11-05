/** Explicit private-response coverage shared by the HTTP and discovery regression checks. */
export const privateResponseSources = Object.freeze([
  '/analytics', '/api/analytics/:path*', '/admin', '/admin/:path*', '/api/admin/:path*',
  '/en/account', '/en/subscribe', '/en/best-slips/:date/:number', '/api/account/:path*', '/api/slips/:path*',
  '/r/:path*', '/s/:path*', '/payment-review/:path*',
]);
