import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AccountType,
  AuthenticatedUser,
  AuthSession,
  AuthTokens,
  LoginDto,
  RegisterOrganizationDto,
  RegisterPersonDto,
} from '@adoptafacil/contracts';
import { NOTIFICATION_PORT, type NotificationPort } from '../../notifications/notification.port';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/** How long a password-reset token stays valid. */
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
  ) {}

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

  async refresh(refreshToken: string): Promise<AuthTokens> {
    return this.tokens.rotate(refreshToken);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revoke(refreshToken);
  }

  /**
   * Password-reset skeleton: create a single-use token and deliver it through
   * the simulable NotificationPort. Always resolves — never reveals whether the
   * email exists — and NEVER logs the token itself.
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
    await this.prisma.passwordResetToken.create({
      data: {
        userId: credential.userId,
        tokenHash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    await this.notifications.send({
      to: normalizedEmail,
      subject: 'Restablece tu contraseña de AdoptaFácil',
      body: `Usa este código para restablecer tu contraseña: ${token}`,
    });
    this.logger.log(`Password reset requested for a user (token delivered via notification port)`);
  }
}
