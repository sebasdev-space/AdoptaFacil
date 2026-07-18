import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { AuthenticatedRequest, RequestUser } from './auth.types';

/** Param decorator exposing the authenticated principal set by {@link JwtAuthGuard}. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
