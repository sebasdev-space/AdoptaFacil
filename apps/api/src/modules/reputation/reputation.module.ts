import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { PlatformReviewsController } from './platform-reviews.controller';
import { PlatformReviewsService } from './platform-reviews.service';
import { PublicReputationController } from './public-reputation.controller';
import { PublicReputationService } from './public-reputation.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

/** M12 · reputación: reseñas, calificación e indicadores públicos (RF23, S-7). */
@Module({
  imports: [AuthModule],
  controllers: [ReviewsController, PlatformReviewsController, PublicReputationController],
  providers: [ReviewsService, PlatformReviewsService, PublicReputationService],
})
export class ReputationModule {}
