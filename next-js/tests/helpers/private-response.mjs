/** Explicit private-response coverage shared by the HTTP and discovery regression checks. */
export const privateResponseSources = Object.freeze([
  '/analytics', '/api/analytics/:path*', '/admin', '/admin/:path*', '/api/admin/:path*',
  '/en/account', '/en/subscribe', '/en/best-slips/:date/:number', '/api/account/:path*', '/api/slips/:path*', '/api/payments/flutterwave/:path*',
  '/r/:path*', '/s/:path*', '/payment-review/:path*', '/en/account/reset-password',
]);

export function expectedPrivateResponseHeaders(source, common) {
  const headers = Object.fromEntries(Object.entries(common).filter(([key]) => key !== 'X-Content-Type-Options'));
  if (source === '/en/account/reset-password') headers['Referrer-Policy'] = 'no-referrer';
  return headers;
}
