import { INestApplicationContext, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { runSeed } from './run-seed';
import { SeedService } from './seed.service';

describe('runSeed', () => {
  let createContext: jest.SpyInstance;
  let errorLog: jest.SpyInstance;
  let seed: jest.Mock;
  let close: jest.Mock;

  beforeEach(() => {
    seed = jest.fn().mockResolvedValue(undefined);
    close = jest.fn().mockResolvedValue(undefined);
    const app = {
      get: jest.fn((token: unknown) => (token === SeedService ? { seed } : undefined)),
      close,
    } as unknown as INestApplicationContext;
    createContext = jest.spyOn(NestFactory, 'createApplicationContext').mockResolvedValue(app);
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // A failure test sets exitCode, which would otherwise fail the Jest run.
    process.exitCode = undefined;
  });

  // A fresh registry loads the module again with the spy already on its own
  // copy of NestFactory, so a seed started at import time would show up.
  it('does not start a seed when the module is imported', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const core = require('@nestjs/core') as typeof import('@nestjs/core');
      const isolatedCreate = jest
        .spyOn(core.NestFactory, 'createApplicationContext')
        .mockReturnValue(new Promise<never>(() => undefined));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./run-seed');
      expect(isolatedCreate).not.toHaveBeenCalled();
    });
  });

  it('seeds, closes the context and leaves the exit code alone', async () => {
    await runSeed();

    expect(seed).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(errorLog).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('logs a rejected seed, sets exit code 1 and still closes the context', async () => {
    seed.mockRejectedValue(new Error('transaction timed out'));

    await runSeed();

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('Seed failed'),
      expect.stringContaining('transaction timed out')
    );
    expect(process.exitCode).toBe(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('sets exit code 1 when the context cannot start, with nothing to close', async () => {
    createContext.mockRejectedValue(new Error('password authentication failed'));

    await runSeed();

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('Seed failed'),
      expect.stringContaining('password authentication failed')
    );
    expect(process.exitCode).toBe(1);
    expect(close).not.toHaveBeenCalled();
  });
});
