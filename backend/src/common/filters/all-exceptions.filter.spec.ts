import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client';
import { AppModule } from '../../app.module';
import { AllExceptionsFilter } from './all-exceptions.filter';

/** A known request error carrying the cause the pg driver adapter attaches. */
function adapterError(
  code: string,
  cause: Record<string, unknown>,
  message = 'Database error'
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: '7.10.0',
    meta: { modelName: 'Subclass', driverAdapterError: { name: 'DriverAdapterError', cause } },
  });
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockGetResponse: jest.Mock;
  let mockGetRequest: jest.Mock;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockGetResponse = jest.fn().mockReturnValue({ status: mockStatus });
    mockGetRequest = jest.fn().mockReturnValue({ url: '/api/test', method: 'POST' });
  });

  function createHost(): ArgumentsHost {
    return {
      switchToHttp: () => ({
        getResponse: mockGetResponse,
        getRequest: mockGetRequest,
      }),
    } as unknown as ArgumentsHost;
  }

  it('returns standardized response format for unknown errors', () => {
    const error = new Error('something broke');
    filter.catch(error, createHost());

    expect(mockStatus).toHaveBeenCalledWith(500);
    expect(mockJson).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
      timestamp: expect.any(String),
      path: '/api/test',
    });
  });

  it('forwards HttpException with original status and message', () => {
    const error = new NotFoundException('Campaign not found');
    filter.catch(error, createHost());

    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'Campaign not found',
      error: 'Not Found',
      timestamp: expect.any(String),
      path: '/api/test',
    });
  });

  it('returns 404 for Prisma P2025 record not found', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '1.0.0',
    });
    filter.catch(error, createHost());

    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'Record not found',
      error: 'Not Found',
      timestamp: expect.any(String),
      path: '/api/test',
    });
  });

  const P2002_MESSAGE = 'A record with these values already exists';

  function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
    return adapterError('P2002', {
      originalCode: '23505',
      kind: 'UniqueConstraintViolation',
      constraint: { index: 'users_email_key' },
      table: 'users',
    });
  }

  it('returns a fixed 409 for Prisma P2002', () => {
    jest
      .spyOn((filter as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
      .mockImplementation(() => undefined);
    filter.catch(uniqueViolation(), createHost());

    expect(mockStatus).toHaveBeenCalledWith(409);
    expect(mockJson).toHaveBeenCalledWith({
      statusCode: 409,
      message: P2002_MESSAGE,
      error: 'Conflict',
      timestamp: expect.any(String),
      path: '/api/test',
    });
  });

  // The index name is schema detail. It goes to the log, not the client.
  it('logs the constraint server-side and keeps it out of the P2002 body', () => {
    const warnSpy = jest
      .spyOn((filter as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
      .mockImplementation(() => undefined);
    filter.catch(uniqueViolation(), createHost());

    expect(JSON.stringify(mockJson.mock.calls[0][0])).not.toContain('users_email_key');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('users_email_key'));
  });

  it('still answers 409 for a P2002 that names no constraint', () => {
    jest
      .spyOn((filter as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
      .mockImplementation(() => undefined);
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.10.0',
    });
    filter.catch(error, createHost());

    expect(mockStatus).toHaveBeenCalledWith(409);
    expect(mockJson.mock.calls[0][0]).toMatchObject({ message: P2002_MESSAGE });
  });

  // The raw engine message is what a non-DELETE P2003 used to echo. Outside
  // production it carries the absolute server path, a source frame and the
  // constraint name, so this fixture carries all three to prove none survive.
  const RAW_FK_MESSAGE =
    'Invalid `prisma.subclass.create()` invocation in\n' +
    '/app/backend/src/srd/homebrew-subclasses.service.ts:58:31\n\n' +
    '  55   const created = await this.delegate.create({\n' +
    'Foreign key constraint violated on the constraint: `subclasses_classId_fkey`';

  function fkViolation(): Prisma.PrismaClientKnownRequestError {
    return adapterError(
      'P2003',
      {
        originalCode: '23503',
        kind: 'ForeignKeyConstraintViolation',
        constraint: { index: 'subclasses_classId_fkey' },
      },
      RAW_FK_MESSAGE
    );
  }

  it('returns a fixed 400 for Prisma P2003 on writes', () => {
    filter.catch(fkViolation(), createHost());

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith({
      statusCode: 400,
      message: 'A record this request refers to no longer exists; refresh and try again',
      error: 'Bad Request',
      timestamp: expect.any(String),
      path: '/api/test',
    });
  });

  it('leaks neither the constraint name nor the raw engine message on a write P2003', () => {
    jest
      .spyOn((filter as unknown as { logger: { error: jest.Mock } }).logger, 'error')
      .mockImplementation(() => undefined);

    filter.catch(fkViolation(), createHost());

    const body = JSON.stringify(mockJson.mock.calls[0][0]);
    expect(body).not.toContain('subclasses_classId_fkey');
    expect(body).not.toContain('homebrew-subclasses.service.ts');
    expect(body).not.toContain('Invalid `prisma');
  });

  it('logs the constraint server-side when P2003 rejects a write', () => {
    const logSpy = jest
      .spyOn((filter as unknown as { logger: { error: jest.Mock } }).logger, 'error')
      .mockImplementation(() => undefined);

    filter.catch(fkViolation(), createHost());

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('subclasses_classId_fkey'));
  });

  // P2006 shared the echoing branch. Its message names the model, the field and
  // the offending value, none of which the client needs to be told back.
  it('returns a fixed 400 for Prisma P2006 without echoing the value or field', () => {
    jest
      .spyOn((filter as unknown as { logger: { error: jest.Mock } }).logger, 'error')
      .mockImplementation(() => undefined);
    const error = new Prisma.PrismaClientKnownRequestError(
      'The provided value `s3cr3t` for User field `passwordHash` is not valid',
      { code: 'P2006', clientVersion: '1.0.0', meta: { field_name: 'passwordHash' } }
    );

    filter.catch(error, createHost());

    expect(mockStatus).toHaveBeenCalledWith(400);
    const body = JSON.stringify(mockJson.mock.calls[0][0]);
    expect(body).not.toContain('s3cr3t');
    expect(body).not.toContain('passwordHash');
    expect(mockJson.mock.calls[0][0]).toMatchObject({ statusCode: 400, error: 'Bad Request' });
  });

  // P2006 is a validation error raised before any query, so it carries no
  // driver adapter cause. The log falls back to the field Prisma names.
  it('logs the field server-side for a P2006, which has no adapter cause', () => {
    const logSpy = jest
      .spyOn((filter as unknown as { logger: { error: jest.Mock } }).logger, 'error')
      .mockImplementation(() => undefined);
    const error = new Prisma.PrismaClientKnownRequestError('Invalid value', {
      code: 'P2006',
      clientVersion: '7.10.0',
      meta: { field_name: 'passwordHash' },
    });

    filter.catch(error, createHost());

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('passwordHash'));
  });

  it('logs a legacy meta.constraint when there is no adapter cause', () => {
    const logSpy = jest
      .spyOn((filter as unknown as { logger: { error: jest.Mock } }).logger, 'error')
      .mockImplementation(() => undefined);
    const error = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
      code: 'P2003',
      clientVersion: '7.10.0',
      meta: { constraint: 'subclasses_classId_fkey' },
    });

    filter.catch(error, createHost());

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('subclasses_classId_fkey'));
  });

  // VEG-312: every relation now carries an explicit onDelete policy, so a
  // P2003 on a DELETE means a future relation was added without one. Surface
  // a clean 409 to the client and log the schema diagnostic server-side.
  it('returns a sanitized 409 for Prisma P2003 on DELETE requests', () => {
    mockGetRequest.mockReturnValue({ url: '/api/admin/users/u1', method: 'DELETE' });
    const error = adapterError('P2003', {
      originalCode: '23503',
      kind: 'ForeignKeyConstraintViolation',
      constraint: { index: 'widgets_userId_fkey' },
    });
    filter.catch(error, createHost());

    expect(mockStatus).toHaveBeenCalledWith(409);
    expect(mockJson).toHaveBeenCalledWith({
      statusCode: 409,
      message: 'Cannot delete this record because other records still depend on it',
      error: 'Conflict',
      timestamp: expect.any(String),
      path: '/api/admin/users/u1',
    });
  });

  it('logs the offending relation server-side when P2003 blocks a DELETE', () => {
    const logSpy = jest
      .spyOn((filter as unknown as { logger: { error: jest.Mock } }).logger, 'error')
      .mockImplementation(() => undefined);
    mockGetRequest.mockReturnValue({ url: '/api/admin/users/u1', method: 'DELETE' });
    const error = adapterError('P2003', {
      originalCode: '23503',
      kind: 'ForeignKeyConstraintViolation',
      constraint: { index: 'widgets_userId_fkey' },
    });
    filter.catch(error, createHost());

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('widgets_userId_fkey'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('onDelete'));
  });

  it('does not leak internal details for unrecognized Prisma errors', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Raw query failed. Code: `42P01`. Message: relation "users" does not exist',
      { code: 'P2010', clientVersion: '1.0.0' }
    );
    filter.catch(error, createHost());

    expect(mockStatus).toHaveBeenCalledWith(500);
    expect(mockJson).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
      timestamp: expect.any(String),
      path: '/api/test',
    });
  });

  it('is registered as a global filter in AppModule', () => {
    const providers: any[] = Reflect.getMetadata('providers', AppModule) ?? [];
    const hasFilter = providers.some(
      p => p.provide === APP_FILTER && p.useClass === AllExceptionsFilter
    );
    expect(hasFilter).toBe(true);
  });
});
