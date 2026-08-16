/**
 * Prefer IPv4 DNS results first.
 * Avoids intermittent ENETUNREACH against IPv6-only paths to Postgres/Supabase
 * from some cloud agent / CI networks.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const dns = await import("node:dns");
    dns.setDefaultResultOrder("ipv4first");
  }
}
