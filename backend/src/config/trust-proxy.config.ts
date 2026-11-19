type TrustProxyEnv = Partial<Record<'TRUST_PROXY', string>>;

/**
 * How many proxy hops in front of the backend Express may trust. With a count
 * above 0, req.ip is the client address read from X-Forwarded-For, so the rate
 * limiter keys on the client and not on the proxy. Unset or 0 means no proxy is
 * trusted and req.ip is the direct peer. Compose passes an unset host variable
 * through as an empty string, so empty counts as unset.
 */
export function resolveTrustProxy(env: TrustProxyEnv = process.env): number {
  const raw = env.TRUST_PROXY;
  if (raw === undefined || raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`TRUST_PROXY must be unset or a whole number of proxy hops, got "${raw}"`);
  }
  return Number(raw);
}

/** The startup log line that tells an operator which client address the rate limits use. */
export function trustProxyDescription(env: TrustProxyEnv = process.env): string {
  const hops = resolveTrustProxy(env);
  const source = env.TRUST_PROXY ? `TRUST_PROXY=${env.TRUST_PROXY}` : 'TRUST_PROXY unset';
  if (hops === 0) {
    return `Proxy headers are ignored (${source}). Rate limits key on the address of the direct peer.`;
  }
  return `Trusting ${hops} proxy ${hops === 1 ? 'hop' : 'hops'} (${source}). Rate limits key on the client address from X-Forwarded-For.`;
}
