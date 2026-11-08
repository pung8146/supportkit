/** Patterns are exact origins or `https://*.example.com` (subdomains only, not the apex). */
export function originAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false;

  return allowed.some((pattern) => {
    const wildcard = pattern.split('://*.');
    if (wildcard.length !== 2) return pattern === origin;
    const [scheme, domain] = wildcard as [string, string];
    return url.protocol === `${scheme}:` && url.host.endsWith(`.${domain}`) && url.host.length > domain.length + 1;
  });
}

export function frameAncestors(allowed: string[]): string {
  return allowed.length > 0 ? allowed.join(' ') : "'none'";
}
