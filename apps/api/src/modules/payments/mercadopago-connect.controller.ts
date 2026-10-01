import { ConfigService } from '@nestjs/config';
import { Controller, Delete, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  Role,
  type MercadoPagoConnectStatusView,
  type MercadoPagoConnectUrlView,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { MercadoPagoConnectService } from './mercadopago-connect.service';

/** Same "who manages the org's payout setup" audience as
 *  `BankAccountsController` (Owner/Administrator) — connecting a payment
 *  account is the same class of financial-configuration action. */
const MANAGE_ROLES = [Role.Owner, Role.Administrator] as const;

/**
 * Split de Pagos 1:1 (T-OAuth-Connect) — "Conectar Mercado Pago" OAuth infra.
 * Three routes are authenticated (Owner/Administrator, same as
 * `/org/payout-bank-account`); `/callback` is deliberately PUBLIC — it is
 * MercadoPago's own browser redirect back to us, which carries no
 * Authorization header. That endpoint verifies the signed `state` JWT itself
 * (see `MercadoPagoConnectService`) instead of relying on a guard.
 */
@Controller('org/mercadopago')
export class MercadoPagoConnectController {
  constructor(
    private readonly service: MercadoPagoConnectService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get('connect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...MANAGE_ROLES)
  getConnectUrl(): MercadoPagoConnectUrlView {
    return this.service.getConnectUrl();
  }

  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...MANAGE_ROLES)
  getStatus(): Promise<MercadoPagoConnectStatusView> {
    return this.service.getStatus();
  }

  @Delete('connect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...MANAGE_ROLES)
  async disconnect(@CurrentUser() actor: RequestUser): Promise<{ ok: true }> {
    await this.service.disconnect(actor.id);
    return { ok: true };
  }

  /**
   * PUBLIC — MercadoPago's own redirect after the org authorizes access.
   * Never leaks WHY a failure happened in the redirect URL itself (no error
   * details in the query string, just a generic `error` flag) — the real
   * reason is logged server-side only, inside the service.
   */
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const webBaseUrl = (this.config.get('WEB_BASE_URL', { infer: true }) as string).replace(
      /\/$/,
      '',
    );
    if (!code || !state) {
      res.redirect(302, `${webBaseUrl}/organizacion?mercadopago=error`);
      return;
    }
    try {
      await this.service.handleCallback(code, state);
      res.redirect(302, `${webBaseUrl}/organizacion?mercadopago=connected`);
    } catch {
      // The service already logged the real reason server-side.
      res.redirect(302, `${webBaseUrl}/organizacion?mercadopago=error`);
    }
  }
}
