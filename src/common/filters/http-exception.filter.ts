import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

/** Formats all errors into the standard error envelope from docs/api-contract.md. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload =
        typeof body === 'string'
          ? { message: body }
          : (body as Record<string, unknown>);
      return res.status(status).json({
        success: false,
        statusCode: status,
        error: exception.message,
        message: payload.message ?? exception.message,
        ...(payload.details ? { details: payload.details } : {}),
      });
    }

    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Terjadi kesalahan pada server',
    });
  }
}
