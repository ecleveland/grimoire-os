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

  it('registers under the database namespace', () => {
    expect(databaseConfig.KEY).toBe('CONFIGURATION(database)');
  });

  it('is the same block the app-wide configuration returns', () => {
    process.env.JWT_SECRET = 'secret';
    process.env.DATABASE_URL = 'postgresql://u:p@db:5432/x';

    expect(configuration().database).toEqual(databaseConfig());
  });
});
