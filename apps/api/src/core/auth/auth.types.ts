import type { Request } from 'express';
import type { AccountType } from '@adoptafacil/contracts';

/** The principal attached to the request after the JWT guard validates a token. */
export interface RequestUser {
  id: string;
  organizationId: string;
  accountType: AccountType;
  email: string;
}

/** Express request augmented with the authenticated principal. */
export interface AuthenticatedRequest extends Request {
  user?: RequestUser;
}
