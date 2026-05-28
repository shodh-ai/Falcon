import { Injectable, Logger } from '@nestjs/common';
import { CsvUploadService, CsvImportResult } from './csv-upload.service';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly csv: CsvUploadService) {}

  async importLegacyUsers(buffer: Buffer): Promise<CsvImportResult> {
    return this.csv.processCsv(buffer, async (row, rowIndex) => {
      if (!row.email && !row.name) {
        throw new Error(`Row ${rowIndex}: missing required email/name`);
      }
      // TODO(devs): map row -> UsersService.upsert when wiring this in.
      this.logger.debug(`Would import row ${rowIndex}: ${JSON.stringify(row)}`);
    });
  }
}
