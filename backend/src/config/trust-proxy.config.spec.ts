import configuration from './configuration';
import { resolveTrustProxy, trustProxyDescription } from './trust-proxy.config';

describe('trust-proxy.config', () => {
  describe('resolveTrustProxy', () => {
    it.each`
      trustProxy   | expected
      ${undefined} | ${0}
      ${''}        | ${0}
      ${'0'}       | ${0}
      ${'1'}       | ${1}
      ${'2'}       | ${2}
    `('TRUST_PROXY=$trustProxy gives $expected hops', ({ trustProxy, expected }) => {
      expect(resolveTrustProxy({ TRUST_PROXY: trustProxy })).toBe(expected);
    });

    it.each(['true', '-1', '1.5', 'abc', ' 1', '01x'])(
      'rejects TRUST_PROXY=%j with an error naming the variable and value',
      value => {
        expect(() => resolveTrustProxy({ TRUST_PROXY: value })).toThrow(
          `TRUST_PROXY must be unset or a whole number of proxy hops, got "${value}"`
        );
      }
    );

    it('reads process.env when no env is passed', () => {
      const original = process.env.TRUST_PROXY;
      try {
        process.env.TRUST_PROXY = '3';
        expect(resolveTrustProxy()).toBe(3);
      } finally {
        if (original === undefined) delete process.env.TRUST_PROXY;
        else process.env.TRUST_PROXY = original;
      }
    });
  });

  describe('trustProxyDescription', () => {
    it('says the proxy headers are ignored when TRUST_PROXY is unset', () => {
      expect(trustProxyDescription({})).toBe(
        'Proxy headers are ignored (TRUST_PROXY unset). Rate limits key on the address of the direct peer.'
      );
    });

    it('says the proxy headers are ignored when TRUST_PROXY is 0', () => {
      expect(trustProxyDescription({ TRUST_PROXY: '0' })).toBe(
        'Proxy headers are ignored (TRUST_PROXY=0). Rate limits key on the address of the direct peer.'
      );
    });

    it('names the hop count when TRUST_PROXY is set', () => {
      expect(trustProxyDescription({ TRUST_PROXY: '1' })).toBe(
        'Trusting 1 proxy hop (TRUST_PROXY=1). Rate limits key on the client address from X-Forwarded-For.'
      );
    });

    it('uses the plural for more than one hop', () => {
      expect(trustProxyDescription({ TRUST_PROXY: '2' })).toBe(
        'Trusting 2 proxy hops (TRUST_PROXY=2). Rate limits key on the client address from X-Forwarded-For.'
      );
    });
  });
});

describe('configuration', () => {
  const original = {
    COOKIE_SECURE: process.env.COOKIE_SECURE,
    JWT_SECRET: process.env.JWT_SECRET,
    TRUST_PROXY: process.env.TRUST_PROXY,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('refuses to load with an invalid TRUST_PROXY', () => {
    process.env.JWT_SECRET = 'secret';
    delete process.env.COOKIE_SECURE;
    process.env.TRUST_PROXY = 'true';

    expect(() => configuration()).toThrow('TRUST_PROXY must be unset or a whole number');
  });

  it('exposes the resolved hop count', () => {
    process.env.JWT_SECRET = 'secret';
    delete process.env.COOKIE_SECURE;
    process.env.TRUST_PROXY = '1';

    expect(configuration().trustProxy).toBe(1);
  });
});
