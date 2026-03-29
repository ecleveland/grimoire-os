import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

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
    mockGetRequest = jest.fn().mockReturnValue({ url: '/api/test' });
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

  it('returns 409 for Prisma P2002 unique constraint with conflicting fields', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '1.0.0',
      meta: { target: ['email'] },
    });
    filter.catch(error, createHost());

    expect(mockStatus).toHaveBeenCalledWith(409);
    expect(mockJson).toHaveBeenCalledWith({
      statusCode: 409,
      message: 'Unique constraint violation on: email',
      error: 'Conflict',
      timestamp: expect.any(String),
      path: '/api/test',
    });
  });

  it('returns 400 for Prisma P2003 foreign key constraint', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
      code: 'P2003',
      clientVersion: '1.0.0',
    });
    filter.catch(error, createHost());

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith({
      statusCode: 400,
      message: 'Foreign key constraint failed',
      error: 'Bad Request',
      timestamp: expect.any(String),
      path: '/api/test',
    });
  });
});
