// Zod validation pipe + stable error shape filter.
import { ArgumentMetadata, BadRequestException, Catch, ExceptionFilter, ArgumentsHost, HttpException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';
import { StoreError } from '@crm/shared';

@Injectable()
export class ZodPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}
  transform(value: unknown, _meta: ArgumentMetadata) {
    const res = this.schema.safeParse(value);
    if (!res.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request body failed validation',
        details: res.error.flatten(),
      });
    }
    return res.data;
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    let status = 500;
    let body: Record<string, unknown>;
    if (exception instanceof StoreError) {
      status = exception.status;
      body = { code: exception.code, message: exception.message, details: exception.details };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      body = typeof payload === 'string' ? { code: 'ERROR', message: payload } : (payload as Record<string, unknown>);
    } else {
      console.error('UNHANDLED', exception);
      body = { code: 'INTERNAL', message: 'Unexpected server error' };
    }
    res.status(status).json(body);
  }
}
