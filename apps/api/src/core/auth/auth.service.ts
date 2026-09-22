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
  type CompleteProfileInput,
  type GoogleSignInInput,
  type IdentityPort,
  type LoginDto,
  type RegisterOrganizationDto,
  type RegisterPersonDto,
  Role,
} from '@adoptafacil/contracts';
import { AuditService } from '../audit/audit.service';
import { IDENTITY_PORT } from '../identity/identity.port';
import { NOTIFICATION_PORT, type NotificationPort } from '../notifications/notification.port';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_ANIMAL_BREEDS } from '../../modules/animals/animal-breeds.catalog';
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
    @Inject(IDENTITY_PORT) private readonly identity: IdentityPort,
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
        // S2-04A: preload the common breed catalog for the new org (a Person's
        // personal organization never manages animals, so it's skipped). Each
        // org's rows stay independent afterward — the org may edit/remove them.
        await tx.animalBreed.createMany({
          data: DEFAULT_ANIMAL_BREEDS.map((breed) => ({
            organizationId,
            species: breed.species,
            name: breed.name,
          })),
          skipDuplicates: true,
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

  /** Build the client-facing principal, folding in the tenant-scoped profile's
   *  optional fields (T-Google-SignIn) — the single place every auth flow
   *  (password login, Google Sign-In, `/auth/me`) shapes an AuthenticatedUser. */
  private toAuthenticatedUser(
    principal: { id: string; email: string; accountType: AccountType; organizationId: string },
    profile?: {
      displayName?: string | null;
      phone?: string | null;
      documentId?: string | null;
      address?: string | null;
    } | null,
  ): AuthenticatedUser {
    return {
      id: principal.id,
      email: principal.email,
      displayName: profile?.displayName ?? principal.email,
      accountType: principal.accountType,
      organizationId: principal.organizationId,
      phone: profile?.phone ?? undefined,
      documentId: profile?.documentId ?? undefined,
      address: profile?.address ?? undefined,
    };
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

    const user = this.toAuthenticatedUser(
      {
        id: credential.userId,
        email: credential.email,
        accountType,
        organizationId: credential.organizationId,
      },
      profile,
    );
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
    return this.toAuthenticatedUser(principal, profile);
  }

  /**
   * Google Sign-In (T-Google-SignIn, `POST /auth/google`): verifies the ID
   * token via IdentityPort, then AUTO-LINKS by email to an existing
   * AuthCredential (regardless of whether it was originally created with a
   * password or with Google) — or, the first time, creates a lightweight
   * Person account (NEVER an Organization; registering one stays the long
   * NIT/legal-representative form). Ends the SAME way as password login/
   * register: a fresh AuthSession (access + refresh JWT pair) — Google
   * Sign-In is a different FRONT DOOR into the exact same session type, not a
   * separate kind of session.
   */
  async googleSignIn(dto: GoogleSignInInput): Promise<AuthSession> {
    const claims = await this.identity.verifyGoogleIdToken(dto.idToken);
    const normalizedEmail = claims.email.trim().toLowerCase();

    const existing = await this.prisma.authCredential.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      // Auto-link: enter the existing account as-is, whatever its accountType
      // or original authProvider — Google Sign-In never mutates the account.
      const accountType = existing.accountType as AccountType;
      const profile = await this.prisma.withOrgContext(existing.organizationId, (tx) =>
        tx.user.findUnique({ where: { id: existing.userId } }),
      );
      const user = this.toAuthenticatedUser(
        {
          id: existing.userId,
          email: existing.email,
          accountType,
          organizationId: existing.organizationId,
        },
        profile,
      );
      const tokens = await this.tokens.issueTokens({
        userId: existing.userId,
        organizationId: existing.organizationId,
        accountType,
        email: existing.email,
      });
      return { user, tokens };
    }

    // First time: create a lightweight PERSON account. The password hash is a
    // random, unguessable value — never usable to log in with a password (this
    // account only ever authenticates via Google) — but stored the SAME way as
    // a real password so `passwordHash` stays a plain required column with no
    // separate "no password" state to model.
    const passwordHash = await this.passwords.hash(randomBytes(32).toString('hex'));
    const organizationId = randomUUID();
    const userId = randomUUID();
    const displayName = claims.name.trim() || normalizedEmail;

    await this.prisma.withOrgContext(organizationId, async (tx) => {
      await tx.organization.create({ data: { id: organizationId, name: displayName } });
      await tx.user.create({
        data: {
          id: userId,
          organizationId,
          accountType: 'person',
          email: normalizedEmail,
          displayName,
        },
      });
      await tx.authCredential.create({
        data: {
          userId,
          organizationId,
          accountType: 'person',
          email: normalizedEmail,
          passwordHash,
          authProvider: 'google',
          googleSub: claims.sub,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: userId,
        action: 'auth.google_signup',
        entityType: 'user',
        entityId: userId,
      });
    });

    const user = this.toAuthenticatedUser({
      id: userId,
      email: normalizedEmail,
      accountType: 'person',
      organizationId,
    });
    const tokens = await this.tokens.issueTokens({
      userId,
      organizationId,
      accountType: 'person',
      email: normalizedEmail,
    });
    return { user, tokens };
  }

  /**
   * Profile-completion gate (T-Google-SignIn, business rule #3): a Person
   * fills in `phone`/`documentId`/`address` here — each field independently
   * optional, so a caller only sends what's still missing. Read back via
   * `requireCompleteProfile` (core/auth/require-complete-profile.ts) before
   * donating/apadrinar, requesting an adoption, or enrolling as a volunteer.
   */
  async completeProfile(actor: RequestUser, dto: CompleteProfileInput): Promise<AuthenticatedUser> {
    const profile = await this.prisma.withOrgContext(actor.organizationId, (tx) =>
      tx.user.update({
        where: { id: actor.id },
        data: {
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.documentId !== undefined ? { documentId: dto.documentId } : {}),
          ...(dto.address !== undefined ? { address: dto.address } : {}),
        },
      }),
    );
    await this.audit.record({
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: 'user.profile_completed',
      entityType: 'user',
      entityId: actor.id,
      // Never the actual values (Ley 1581) — only which fields were touched.
      metadata: { fields: Object.keys(dto) },
    });
    return this.toAuthenticatedUser(actor, profile);
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
