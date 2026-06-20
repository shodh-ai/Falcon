import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import {
  LibraryController,
  LibraryAdminController,
} from './library.controller';
import { LibraryService } from './library.service';
import { IsbnLookupService } from './isbn-lookup.service';

@Module({
  imports: [FinanceModule],
  controllers: [LibraryController, LibraryAdminController],
  providers: [LibraryService, IsbnLookupService],
  exports: [LibraryService],
})
export class LibraryModule {}
