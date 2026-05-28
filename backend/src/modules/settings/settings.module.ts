import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { CsvUploadService } from './csv-upload.service';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, CsvUploadService],
  exports: [SettingsService, CsvUploadService],
})
export class SettingsModule {}
