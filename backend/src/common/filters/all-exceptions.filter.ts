import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

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
      case 'P2006':
        // Every relation carries an explicit onDelete policy (VEG-312), so an
        // FK violation on a DELETE means a relation was added without one.
        // Give the client a clean 409 and keep the schema diagnostic in the
        // server log, where the missing-policy bug actually gets fixed.
        if (exception.code === 'P2003' && method === 'DELETE') {
          const fieldName = (exception.meta?.field_name as string) ?? 'unknown relation';
          this.logger.error(
            `P2003 blocked a DELETE via "${fieldName}" — a relation is missing an onDelete policy (see VEG-312)`
          );
          return {
            statusCode: HttpStatus.CONFLICT,
            message: 'Cannot delete this record because other records still depend on it',
            error: 'Conflict',
          };
        }
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: exception.message.replace(/\n/g, ' ').trim(),
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
