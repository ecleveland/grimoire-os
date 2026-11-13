type CookieEnv = Partial<Record<'COOKIE_SECURE' | 'NODE_ENV', string>>;

/**
 * The COOKIE_SECURE override, or undefined when it is unset. Compose passes an
 * unset host variable through as an empty string, so empty counts as unset.
 */
function cookieSecureOverride(env: CookieEnv): boolean | undefined {
  const raw = env.COOKIE_SECURE;
  if (raw === undefined || raw === '') return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`COOKIE_SECURE must be "true", "false" or unset, got "${raw}"`);
}

/**
 * Whether every auth and CSRF cookie carries the Secure flag. COOKIE_SECURE
 * wins when set. Unset, the flag follows NODE_ENV=production. A plain-HTTP
 * install on a trusted network sets COOKIE_SECURE=false, because a browser
 * drops a Secure cookie that arrives over HTTP and login then fails silently.
 */
export function resolveCookieSecure(env: CookieEnv = process.env): boolean {
  return cookieSecureOverride(env) ?? env.NODE_ENV === 'production';
}

/** The startup log line that tells an operator which cookie mode is in force. */
export function cookieModeDescription(env: CookieEnv = process.env): string {
  const override = cookieSecureOverride(env);
  const secure = resolveCookieSecure(env);
  const source =
    override === undefined
      ? `COOKIE_SECURE unset, ${env.NODE_ENV ? `NODE_ENV=${env.NODE_ENV}` : 'NODE_ENV unset'}`
      : `COOKIE_SECURE=${override}`;

  if (!secure) {
    return `Auth cookies are sent without the Secure flag (${source}). Browsers send them over plain HTTP.`;
  }
  const hint = override === undefined ? ' Set COOKIE_SECURE=false to serve over plain HTTP.' : '';
  return `Auth cookies carry the Secure flag (${source}). Browsers send them only over HTTPS, so login over plain HTTP fails.${hint}`;
}
