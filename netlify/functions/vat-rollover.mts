// Netlify replacement for the Vercel cron in vercel.json.
// Runs at 00:00 UTC on the 21st of each month and calls the existing API route.
export default async () => {
  const headers: Record<string, string> = {};
  if (process.env.CRON_SECRET) {
    headers.Authorization = `Bearer ${process.env.CRON_SECRET}`;
  }

  const res = await fetch(`${process.env.URL}/api/cron/vat-rollover`, { headers });
  console.log(`[vat-rollover] status ${res.status}`);
};

export const config = {
  schedule: "0 0 21 * *",
};
