import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { AuditModule } from './core/audit/audit.module';
import { AuthModule } from './core/auth/auth.module';
import { NotificationModule } from './core/notifications/notification.module';
import { PaymentModule } from './core/payments/payment.module';
import { RbacModule } from './core/rbac/rbac.module';
import { StorageModule } from './core/storage/storage.module';
import { TenantModule } from './core/tenant/tenant.module';
import { HealthModule } from './health/health.module';
import { AdoptionsModule } from './modules/adoptions/adoptions.module';
import { AnimalsModule } from './modules/animals/animals.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { CommunityModule } from './modules/community/community.module';
import { DonationsModule } from './modules/donations/donations.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { OrgModule } from './modules/org/org.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PortalsModule } from './modules/portals/portals.module';
import { ReputationModule } from './modules/reputation/reputation.module';
import { ResourcesModule } from './modules/resources/resources.module';
import { SponsorshipsModule } from './modules/sponsorships/sponsorships.module';
import { VolunteeringModule } from './modules/volunteering/volunteering.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queues/queue.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // The single .env lives at the repo root; also allow a package-local one.
      envFilePath: [join(process.cwd(), '.env'), join(process.cwd(), '..', '..', '.env')],
    }),
    // AuthModule registers the global JwtModule, so it is imported before
    // TenantModule whose middleware verifies the access token to resolve the
    // tenant. TenantModule is in turn before PrismaModule so its global
    // TenantContextService is available for PrismaService injection.
    AuthModule,
    AuditModule,
    RbacModule,
    TenantModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    NotificationModule,
    // Shared infra ports (T-107): single StoragePort provider, global.
    StorageModule,
    // Shared PaymentPort provider (T-052): binds the fake adapter, global.
    PaymentModule,
    HealthModule,
    // Feature modules (registered last; core modules above are unchanged).
    OrgModule,
    // M14 · portal personalization by tokens + public theme read (T-027).
    PortalsModule,
    // M03 · animal record (expediente, RF07 / T-104).
    AnimalsModule,
    // M04 · adoption request + evaluation kanban (T-028a).
    AdoptionsModule,
    // M05 · donations (P1: breakdown + "cubro la comisión" + receipt, T-050).
    DonationsModule,
    // M06 · fundraising campaigns (RF15 / T-053).
    CampaignsModule,
    // M07 · recurring sponsorships base (RF17 / T-056, no payment yet).
    SponsorshipsModule,
    // M15b · dispersión T+1 vía Wompi Payouts (RF26, F-4).
    PaymentsModule,
    // M09 · banco de recursos: necesidades, ofertas y entregas (Ola 3, F-6).
    ResourcesModule,
    // M10 · marketplace simplificado: catálogo por organización (Ola 3, F-7).
    MarketplaceModule,
    // M11 · comunidad: publicaciones, comentarios, likes y moderación (Ola 3, F-8).
    CommunityModule,
    // M08 · voluntariado + servicio social estudiantil (RF18/RF19, Ola 3, S-6).
    VolunteeringModule,
    // M12 · reputación: reseñas, calificación e indicadores públicos (RF23, S-7).
    ReputationModule,
  ],
})
export class AppModule {}
