import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/** Wraps successful responses in the standard envelope from docs/api-contract.md. */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        if (data === null || data === undefined) {
          return { success: true, data: null };
        }
        // Pagination responses already carry their own {data, meta} shape.
        if (
          typeof data === 'object' &&
          'data' in data &&
          ('meta' in data || (data as { data?: unknown }).data instanceof Array)
        ) {
          return { success: true, ...data };
        }
        return { success: true, data };
      }),
    );
  }
}
