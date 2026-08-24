import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { PublicVolunteeringController } from './public-volunteering.controller';
import { ServiceHoursController } from './service-hours.controller';
import { ServiceHoursService } from './service-hours.service';
import { VolunteerCertificatesController } from './volunteer-certificates.controller';
import { VolunteerCertificatesService } from './volunteer-certificates.service';
import { VolunteerEnrollmentsController } from './volunteer-enrollments.controller';
import { VolunteerEnrollmentsService } from './volunteer-enrollments.service';
import { VolunteerOpportunitiesController } from './volunteer-opportunities.controller';
import { VolunteerOpportunitiesService } from './volunteer-opportunities.service';

/**
 * M08 · Volunteer opportunities, enrollment, service hours and certificates
 * (RF18/RF19, §10/§14). Consumes core (tenant/auth/rbac/audit/notifications) —
 * global providers; AuthModule is imported for the JwtAuthGuard. Built from
 * scratch (Ola 3, no prior code) — no cross-module domain dependency; only
 * reads the ALREADY-BUILT `organization_public` SECURITY DEFINER function
 * (T-101, org module) for the public listing, never a raw cross-tenant select.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    VolunteerOpportunitiesController,
    PublicVolunteeringController,
    VolunteerEnrollmentsController,
    ServiceHoursController,
    VolunteerCertificatesController,
  ],
  providers: [
    VolunteerOpportunitiesService,
    VolunteerEnrollmentsService,
    ServiceHoursService,
    VolunteerCertificatesService,
  ],
})
export class VolunteeringModule {}
