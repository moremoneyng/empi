/**
 * Public base URL of the site, for server-side calls to our own API routes and links in emails.
 * On Vercel the production domain is preferred over the per-deployment URL (which can sit
 * behind deployment protection and reject our own server-to-server calls).
 */
export function getSiteUrl(): string {
  const url =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000';
  return url.replace(/\/+$/, '');
}
