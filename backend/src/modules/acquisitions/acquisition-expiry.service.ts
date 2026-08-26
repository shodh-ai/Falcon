import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AcquisitionService } from './acquisition.service';

@Injectable()
export class AcquisitionExpiryService {
  private readonly logger = new Logger(AcquisitionExpiryService.name);

  constructor(private readonly acquisitions: AcquisitionService) {}

  @Interval(60_000)
  async expireReservations() {
    try {
      await this.acquisitions.expireDueReservations();
    } catch (error) {
      this.logger.error(
        'Failed to expire acquisition budget reservations',
        error,
      );
    }
  }
}
