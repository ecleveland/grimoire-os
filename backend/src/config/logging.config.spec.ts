import { stripVTControlCharacters } from 'node:util';
import { createAppLogger, resolveLogFormat, resolveLogLevels } from './logging.config';

describe('logging.config', () => {
  describe('resolveLogLevels', () => {
    it.each`
      logLevel     | expected
      ${undefined} | ${['fatal', 'error', 'warn', 'log']}
      ${''}        | ${['fatal', 'error', 'warn', 'log']}
      ${'error'}   | ${['fatal', 'error']}
      ${'warn'}    | ${['fatal', 'error', 'warn']}
      ${'log'}     | ${['fatal', 'error', 'warn', 'log']}
      ${'debug'}   | ${['fatal', 'error', 'warn', 'log', 'debug']}
      ${'verbose'} | ${['fatal', 'error', 'warn', 'log', 'debug', 'verbose']}
    `('LOG_LEVEL=$logLevel enables $expected', ({ logLevel, expected }) => {
      expect(resolveLogLevels({ LOG_LEVEL: logLevel })).toEqual(expected);
    });

    it.each(['info', 'WARN', 'fatal', ' log', 'warn,error'])(
      'rejects LOG_LEVEL=%j with an error naming the variable and value',
      value => {
        expect(() => resolveLogLevels({ LOG_LEVEL: value })).toThrow(
          `LOG_LEVEL must be error, warn, log, debug, verbose or unset, got "${value}"`
        );
      }
    );

    it('reads process.env when no env is passed', () => {
      const original = process.env.LOG_LEVEL;
      try {
        process.env.LOG_LEVEL = 'error';
        expect(resolveLogLevels()).toEqual(['fatal', 'error']);
      } finally {
        if (original === undefined) delete process.env.LOG_LEVEL;
        else process.env.LOG_LEVEL = original;
      }
    });
  });

  describe('resolveLogFormat', () => {
    it.each`
      logFormat    | expected
      ${undefined} | ${'text'}
      ${''}        | ${'text'}
      ${'text'}    | ${'text'}
      ${'json'}    | ${'json'}
    `('LOG_FORMAT=$logFormat gives $expected', ({ logFormat, expected }) => {
      expect(resolveLogFormat({ LOG_FORMAT: logFormat })).toBe(expected);
    });

    it.each(['JSON', 'pretty', ' json'])(
      'rejects LOG_FORMAT=%j with an error naming the variable and value',
      value => {
        expect(() => resolveLogFormat({ LOG_FORMAT: value })).toThrow(
          `LOG_FORMAT must be "text", "json" or unset, got "${value}"`
        );
      }
    );

    it('reads process.env when no env is passed', () => {
      const original = process.env.LOG_FORMAT;
      try {
        process.env.LOG_FORMAT = 'json';
        expect(resolveLogFormat()).toBe('json');
      } finally {
        if (original === undefined) delete process.env.LOG_FORMAT;
        else process.env.LOG_FORMAT = original;
      }
    });
  });

  describe('createAppLogger', () => {
    let written: string[];
    let writeSpy: jest.SpyInstance;

    beforeEach(() => {
      written = [];
      writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(chunk => {
        written.push(String(chunk));
        return true;
      });
    });

    afterEach(() => {
      writeSpy.mockRestore();
    });

    it('prints one JSON object per line with structured fields as top-level keys when LOG_FORMAT=json', () => {
      createAppLogger({ LOG_FORMAT: 'json' }).log('GET /api/x 200 3ms', { status: 200 }, 'HTTP');

      expect(written).toHaveLength(1);
      expect(written[0].endsWith('\n')).toBe(true);
      expect(JSON.parse(written[0])).toEqual(
        expect.objectContaining({
          level: 'log',
          context: 'HTTP',
          message: 'GET /api/x 200 3ms',
          status: 200,
        })
      );
    });

    it('prints a plain text line when LOG_FORMAT is unset', () => {
      createAppLogger({}).log('GET /api/x 200 3ms', 'HTTP');

      expect(written).toHaveLength(1);
      // Colors follow the terminal, so strip them before matching.
      expect(stripVTControlCharacters(written[0])).toContain('[HTTP] GET /api/x 200 3ms');
      expect(() => JSON.parse(written[0])).toThrow();
    });

    it('drops lines below LOG_LEVEL', () => {
      const logger = createAppLogger({ LOG_LEVEL: 'warn' });

      logger.log('quiet', 'HTTP');
      logger.warn('loud', 'HTTP');

      expect(written).toHaveLength(1);
      expect(written[0]).toContain('loud');
    });

    it('throws on a bad LOG_FORMAT, so the boot stops', () => {
      expect(() => createAppLogger({ LOG_FORMAT: 'yaml' })).toThrow('LOG_FORMAT must be');
    });
  });
});
