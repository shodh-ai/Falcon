import { Global, Module } from '@nestjs/common';
import { CampusScopeService } from './campus-scope.service';

@Global()
@Module({
  providers: [CampusScopeService],
  exports: [CampusScopeService],
})
export class CampusScopeModule {}
