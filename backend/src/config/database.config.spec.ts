import databaseConfig, { DEFAULT_DATABASE_URL } from './database.config';
import configuration from './configuration';

describe('databaseConfig', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('reads DATABASE_URL', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@db:5432/x';

    expect(databaseConfig()).toEqual({ url: 'postgresql://u:p@db:5432/x' });
  });

  it('falls back to the local default when DATABASE_URL is unset or empty', () => {
    delete process.env.DATABASE_URL;
    expect(databaseConfig().url).toBe(DEFAULT_DATABASE_URL);

    process.env.DATABASE_URL = '';
    expect(databaseConfig().url).toBe(DEFAULT_DATABASE_URL);
  });

  // Prisma 6 read sslmode=require as "encrypt, do not verify the chain". pg
  // reads it as full verification, which a managed provider's private CA fails.
  describe('sslmode', () => {
    const urlWith = (query: string) => `postgresql://u:p@db.example.com:5432/app${query}`;

    it.each(['require', 'prefer'])('encrypts without verifying the chain for %s', mode => {
      process.env.DATABASE_URL = urlWith(`?sslmode=${mode}`);

      expect(databaseConfig().ssl).toEqual({ rejectUnauthorized: false });
    });

    it.each(['verify-ca', 'verify-full'])('verifies the chain for %s', mode => {
      process.env.DATABASE_URL = urlWith(`?sslmode=${mode}`);

      expect(databaseConfig().ssl).toBe(true);
    });

    it.each([
      ['disable', '?sslmode=disable'],
      ['no sslmode', ''],
    ])('leaves ssl unset for %s', (_label, query) => {
      process.env.DATABASE_URL = urlWith(query);

      expect(databaseConfig().ssl).toBeUndefined();
    });

    // pg lets a URL sslmode override an explicit ssl option, so the URL pg
    // receives must not carry one. Every other parameter stays.
    it('removes only sslmode from the URL handed to pg', () => {
      process.env.DATABASE_URL = urlWith('?sslmode=require&application_name=grimoire');

      expect(databaseConfig().url).toBe(urlWith('?application_name=grimoire'));
    });

    it.each([
      ['last', '?application_name=grimoire&sslmode=require', '?application_name=grimoire'],
      ['middle', '?a=1&sslmode=require&b=2', '?a=1&b=2'],
      ['only', '?sslmode=require', ''],
    ])('removes sslmode when it is the %s parameter', (_label, query, expected) => {
      process.env.DATABASE_URL = urlWith(query);

      expect(databaseConfig().url).toBe(urlWith(expected));
    });

    it('keeps the credentials and every other parameter intact', () => {
      const keep =
        'postgresql://app%40corp:p%2Fss%3Aw0rd@db.example.com:6543/app' +
        '?application_name=grimoire&options=-c%20search_path%3Dpublic&connect_timeout=10';
      process.env.DATABASE_URL = keep.replace('?', '?sslmode=require&');

      expect(databaseConfig().url).toBe(keep);
    });

    it('leaves a URL without sslmode byte for byte', () => {
      process.env.DATABASE_URL = urlWith('?application_name=grimoire');

      expect(databaseConfig().url).toBe(urlWith('?application_name=grimoire'));
    });
  });

  it('registers under the database namespace', () => {
    expect(databaseConfig.KEY).toBe('CONFIGURATION(database)');
  });

  it('is the same block the app-wide configuration returns', () => {
    process.env.JWT_SECRET = 'secret';
    process.env.DATABASE_URL = 'postgresql://u:p@db:5432/x';

    expect(configuration().database).toEqual(databaseConfig());
  });
});
