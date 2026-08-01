import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LEADERSHIP_ANOMALY_QUEUE } from '../../common/constants/leadership-queue.constants';
import { RedisModule } from '../../core/redis/redis.module';
import { User } from '../../entities/user.entity';
import { LeadershipController } from './leadership.controller';
import { LeadershipService } from './leadership.service';
import { LeadershipIntelligenceService } from './leadership-intelligence.service';
import { ExecutiveActionService } from './executive-action.service';
import { FinancialOversightService } from './financial-oversight.service';
import { LeadershipGateway } from './leadership.gateway';
import { FinancialFeedEmitter } from './financial-feed.emitter';
import { FinancialFeedListener } from './financial-feed.listener';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { AnomalyDetectionProcessor } from './anomaly-detection.processor';
import { DepartmentScoreService } from './department-score.service';
import { BudgetFpaModule } from './budget-fpa.module';
import { OwnerAccessGuard } from '../../common/guards/owner-access.guard';

@Module({
  imports: [
    BullModule.registerQueue({ name: LEADERSHIP_ANOMALY_QUEUE }),
    TypeOrmModule.forFeature([User]),
    RedisModule,
    BudgetFpaModule,
  ],
  controllers: [LeadershipController],
  providers: [
    LeadershipService,
    LeadershipIntelligenceService,
    ExecutiveActionService,
    FinancialOversightService,
    LeadershipGateway,
    FinancialFeedEmitter,
    FinancialFeedListener,
    AnomalyDetectionService,
    AnomalyDetectionProcessor,
    DepartmentScoreService,
    OwnerAccessGuard,
  ],
  exports: [
    LeadershipService,
    LeadershipIntelligenceService,
    FinancialFeedEmitter,
    DepartmentScoreService,
    ExecutiveActionService,
    AnomalyDetectionService,
  ],
})
export class LeadershipModule {}

