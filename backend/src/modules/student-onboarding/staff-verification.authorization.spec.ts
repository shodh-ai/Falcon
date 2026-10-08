import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('StaffVerificationController authorization', () => {
  it('permits faculty verification only for Campus Admin and Super Admin', () => {
    const source = readFileSync(
      join(__dirname, 'student-onboarding.controller.ts'),
      'utf8',
    );
    const controllerStart = source.indexOf("@Controller('api/staff/verifications')");
    const classStart = source.indexOf('export class StaffVerificationController');
    const controllerMetadata = source.slice(controllerStart, classStart);

    expect(controllerStart).toBeGreaterThanOrEqual(0);
    expect(classStart).toBeGreaterThan(controllerStart);
    expect(controllerMetadata).toContain("@Roles('CampusAdmin', 'SuperAdmin')");
    expect(controllerMetadata).not.toMatch(/'HOD'|'HR'|'HRAdmin'/);
  });
});
