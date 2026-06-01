import { Controller, Get } from '@nestjs/common';
import { PlacementService } from './placement.service';

@Controller('api/placement')
export class PlacementController {
  constructor(private readonly placement: PlacementService) {}

  @Get('companies')
  companies() {
    return this.placement.companies();
  }

  @Get('jobs')
  jobs() {
    return this.placement.jobs();
  }

  @Get('resumes')
  resumes() {
    return this.placement.resumes();
  }

  @Get('mock-interviews')
  mockInterviews() {
    return this.placement.mockInterviews();
  }
}
