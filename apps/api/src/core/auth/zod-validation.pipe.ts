import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Validates and parses a request payload against a Zod schema, throwing a 400
 * with readable messages on failure. Uses Zod (already a dependency) so the
 * auth module needs no extra validation libraries.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((issue) => `${issue.path.join('.') || '(body)'}: ${issue.message}`),
      );
    }
    return result.data;
  }
}
