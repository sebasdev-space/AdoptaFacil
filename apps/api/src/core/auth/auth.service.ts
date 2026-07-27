import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AccountType,
  type AuthenticatedUser,
  type AuthSession,
  type AuthTokens,
  type LoginDto,
  type RegisterOrganizationDto,
  type RegisterPersonDto,
  Role,
} from '@adoptafacil/contracts';
import { AuditService } from '../audit/audit.service';
import { NOTIFICATION_PORT, type NotificationPort } from '../notifications/notification.port';
import { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.validation';
import type { RequestUser } from './auth.types';
import { PasswordService } from './password.service';
import { buildPasswordResetLink } from './password-reset-link';
import { TokenService } from './token.service';

/** How long a password-reset token stays valid (short-lived, single-use). */
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generic message returned whenever a reset token is missing/expired/used/invalid
 * — never reveals which condition failed, to avoid leaking token state.
 */
const INVALID_RESET_TOKEN = 'Invalid or expired password reset token';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly webBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.webBaseUrl = config.get('WEB_BASE_URL', { infer: true });
  }

  async registerOrganization(dto: RegisterOrganizationDto): Promise<AuthSession> {
    return this.register(
      'organization',
      dto.email,
      dto.password,
      dto.displayName,
      dto.organizationName,
    );
  }

  async registerPerson(dto: RegisterPersonDto): Promise<AuthSession> {
    // A person gets their own personal organization so multi-tenant RLS applies
    // uniformly to every principal.
    return this.register('person', dto.email, dto.password, dto.displayName, dto.displayName);
  }

  private async register(
    accountType: AccountType,
    email: string,
    password: string,
    displayName: string,
    organizationName: string,
  ): Promise<AuthSession> {
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await this.prisma.authCredential.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.passwords.hash(password);
    const organizationId = randomUUID();
    const userId = randomUUID();

    // One transaction, scoped to the new org so the RLS WITH CHECK on `users`
    // accepts the insert. `organizations` and the auth tables are not tenant-
    // scoped, but writing them inside the same transaction is fine.
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      await tx.organization.create({ data: { id: organizationId, name: organizationName } });
      await tx.user.create({
        data: { id: userId, organizationId, accountType, email: normalizedEmail, displayName },
      });
      await tx.authCredential.create({
        data: { userId, organizationId, accountType, email: normalizedEmail, passwordHash },
      });
      if (accountType === 'organization') {
        // The registrant is the legal representative → Owner of the new org, the
        // organization's top authority. Written in the SAME transaction (under the
        // new org's RLS context) so a failure rolls back org + user + credential:
        // an organization is never left without an Owner. A Person keeps its
        // personal organization without a role (unchanged from T-011).
        await tx.userRole.create({
          data: { organizationId, userId, role: Role.Owner },
        });
      }
    });

    const user: AuthenticatedUser = {
      id: userId,
      email: normalizedEmail,
      displayName,
      accountType,
      organizationId,
    };
    const tokens = await this.tokens.issueTokens({
      userId,
      organizationId,
      accountType,
      email: normalizedEmail,
    });
    return { user, tokens };
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const credential = await this.prisma.authCredential.findUnique({
      where: { email: normalizedEmail },
    });

    // Always run a bcrypt comparison (dummy hash when the user is unknown) so
    // response timing does not reveal whether the email exists.
    const passwordOk = await this.passwords.verify(
      dto.password,
      credential?.passwordHash ?? PasswordService.DUMMY_HASH,
    );
    if (!credential || !passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accountType = credential.accountType as AccountType;
    // Read the tenant-scoped profile (display name) under the user's org context.
    const profile = await this.prisma.withOrgContext(credential.organizationId, (tx) =>
      tx.user.findUnique({ where: { id: credential.userId } }),
    );

    const user: AuthenticatedUser = {
      id: credential.userId,
      email: credential.email,
      displayName: profile?.displayName ?? credential.email,
      accountType,
      organizationId: credential.organizationId,
    };
    const tokens = await this.tokens.issueTokens({
      userId: credential.userId,
      organizationId: credential.organizationId,
      accountType,
      email: credential.email,
    });
    return { user, tokens };
  }

  /**
   * Resolve the full authenticated principal for `GET /auth/me`. The access
   * token carries no display name, so it is read from the tenant-scoped `users`
   * profile under the principal's own organization context (RLS-safe — only the
   * caller's own org is visible). Falls back to the email if the profile row is
   * missing, so the AuthenticatedUser contract shape is always satisfied.
   */
  async getAuthenticatedUser(principal: RequestUser): Promise<AuthenticatedUser> {
    const profile = await this.prisma.withOrgContext(principal.organizationId, (tx) =>
      tx.user.findUnique({ where: { id: principal.id } }),
    );
    return {
      id: principal.id,
      email: principal.email,
      displayName: profile?.displayName ?? principal.email,
      accountType: principal.accountType,
      organizationId: principal.organizationId,
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    return this.tokens.rotate(refreshToken);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revoke(refreshToken);
  }

  /**
   * Step 1 of recovery (RF05): create a short-lived, single-use, HASHED reset
   * token and email a clickable link to it through the simulable NotificationPort.
   * Always resolves — never reveals whether the email exists — and NEVER logs the
   * token or the link (Ley 1581). The DB stores only the SHA-256 hash of the
   * token; the raw token lives only inside the emailed link.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const credential = await this.prisma.authCredential.findUnique({
      where: { email: normalizedEmail },
    });
    if (!credential) {
      return;
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    // Persist the token and audit the request atomically, under the user's org
    // context so the tenant-scoped audit_log WITH CHECK accepts the row.
    await this.prisma.withOrgContext(credential.organizationId, async (tx) => {
      await tx.passwordResetToken.create({
        data: {
          userId: credential.userId,
          tokenHash,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId: credential.organizationId,
        actorUserId: credential.userId,
        action: 'password_reset.requested',
        entityType: 'user',
        entityId: credential.userId,
      });
    });

    const resetLink = buildPasswordResetLink(this.webBaseUrl, token);
    await this.notifications.send({
      to: normalizedEmail,
      subject: 'Restablece tu contraseña de AdoptaFácil',
      body:
        'Hola,\n\n' +
        'Recibimos una solicitud para restablecer tu contraseña de AdoptaFácil.\n' +
        'Abre este enlace para crear una nueva contraseña (el enlace caduca en 1 hora):\n\n' +
        `${resetLink}\n\n` +
        'Si no solicitaste este cambio, ignora este correo: tu contraseña seguirá igual.',
    });
    // Recipient/token/link are NEVER logged — only that a request was processed.
    this.logger.log('Password reset requested for a user (link delivered via notification port)');
  }

  /**
   * Step 2 of recovery (RF05): consume the single-use token from the emailed link
   * and set the new password. Validates the token (exists, not expired, not used)
   * → on any failure a GENERIC error (never says which condition failed). On
   * success, atomically: marks the token used (single-use), rewrites the password
   * hash, revokes ALL active refresh tokens (a reset means "I recovered my
   * account" — old sessions must fall), and audits the completion. The password
   * strength policy is enforced upstream by the same schema as registration.
   */
  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(INVALID_RESET_TOKEN);
    }
    const credential = await this.prisma.authCredential.findUnique({
      where: { userId: record.userId },
    });
    if (!credential) {
      throw new BadRequestException(INVALID_RESET_TOKEN);
    }

    // Hash BEFORE the transaction so the (CPU-bound) bcrypt cost is not held
    // inside the DB transaction.
    const passwordHash = await this.passwords.hash(newPassword);

    await this.prisma.withOrgContext(credential.organizationId, async (tx) => {
      // Single-use: atomically claim the token (usedAt was null). If another
      // concurrent request already consumed it, count is 0 → reject generically.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException(INVALID_RESET_TOKEN);
      }
      await tx.authCredential.update({
        where: { userId: credential.userId },
        data: { passwordHash },
      });
      // Revoke every active session: recovering the account invalidates any
      // refresh token that might be in someone else's hands.
      await tx.refreshToken.updateMany({
        where: { userId: credential.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.recordWithTx(tx, {
        organizationId: credential.organizationId,
        actorUserId: credential.userId,
        action: 'password_reset.completed',
        entityType: 'user',
        entityId: credential.userId,
      });
    });
    // Never log the token or the new password.
    this.logger.log('Password reset completed for a user (sessions revoked)');
  }
}
