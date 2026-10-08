import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConsumablesService } from './consumables.service';

@Injectable()
export class ConsumablesWorker {
  private readonly logger = new Logger(ConsumablesWorker.name);
  constructor(private readonly service: ConsumablesService) {}
  @Interval(60_000) async expire() {
    try {
      await this.service.expireReservations();
    } catch (error) {
      this.logger.error(
        'Reservation expiry failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
  @Interval(15 * 60_000) async project() {
    try {
      await this.service.recalculateEligibilityAndAlerts();
    } catch (error) {
      this.logger.error(
        'Consumables projection failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
