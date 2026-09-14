import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * The schema object a known request error names, for the server log only.
 *
 * Prisma's error reference documents the key as `field_name`, but the engine
 * this backend runs reports a P2003 under `constraint` instead (measured against
 * a live Postgres: a subclass insert under a missing class raises
 * `meta.constraint = 'subclasses_classId_fkey'`). Reading `field_name` alone
 * logged "unknown relation" for every real violation.
 */
function relationOf(exception: Prisma.PrismaClientKnownRequestError): string {
  const meta = exception.meta as { constraint?: unknown; field_name?: unknown } | undefined;
  const name = meta?.constraint ?? meta?.field_name;
  return typeof name === 'string' ? name : 'unknown relation';
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      ({ statusCode, message, error } = this.handlePrismaError(exception, request.method));
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        message = (obj.message as string | string[]) ?? exception.message;
        error = (obj.error as string) ?? '';
      }
    }

    response.status(statusCode).json({
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private handlePrismaError(
    exception: Prisma.PrismaClientKnownRequestError,
    method?: string
  ): {
    statusCode: number;
    message: string;
    error: string;
  } {
    switch (exception.code) {
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          error: 'Not Found',
        };
      case 'P2002': {
        const target = (exception.meta?.target as string[]) ?? [];
        return {
          statusCode: HttpStatus.CONFLICT,
          message: `Unique constraint violation on: ${target.join(', ')}`,
          error: 'Conflict',
        };
      }
      case 'P2003':
        // Every relation carries an explicit onDelete policy (VEG-312), so an
        // FK violation on a DELETE means a relation was added without one.
        // Give the client a clean 409 and keep the schema diagnostic in the
        // server log, where the missing-policy bug actually gets fixed.
        if (method === 'DELETE') {
          this.logger.error(
            `P2003 blocked a DELETE via "${relationOf(exception)}" — a relation is missing an onDelete policy (see VEG-312)`
          );
          return {
            statusCode: HttpStatus.CONFLICT,
            message: 'Cannot delete this record because other records still depend on it',
            error: 'Conflict',
          };
        }
        // On a write, the row the request points at was there when the service
        // checked and gone by the insert. The engine's message is not safe to
        // return: outside production it carries the server's file path, a source
        // frame and the constraint name. The constraint goes to the log instead.
        this.logger.error(`P2003 rejected a ${method ?? 'write'} via "${relationOf(exception)}"`);
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'A record this request refers to no longer exists; refresh and try again',
          error: 'Bad Request',
        };
      case 'P2006':
        // Same reason as the write branch above: the message names the model,
        // the field and the rejected value, so it stays in the log.
        this.logger.error(`P2006 rejected a value for "${relationOf(exception)}"`);
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'A value in this request is not valid',
          error: 'Bad Request',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          error: 'Internal Server Error',
        };
    }
  }
}
