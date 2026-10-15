import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('StaffVerificationController authorization', () => {
  it('keeps Campus Admin staff access read-only and reserves decisions for HR Admin', () => {
    const source = readFileSync(
      join(__dirname, 'student-onboarding.controller.ts'),
      'utf8',
    );
    const controllerStart = source.indexOf("@Controller('api/staff/verifications')");
    const classStart = source.indexOf('export class StaffVerificationController');
    const controllerMetadata = source.slice(controllerStart, classStart);

    expect(controllerStart).toBeGreaterThanOrEqual(0);
    expect(classStart).toBeGreaterThan(controllerStart);
    expect(controllerMetadata).toContain("@Roles('CampusAdmin', 'SuperAdmin', 'HRAdmin')");
    expect(controllerMetadata).not.toMatch(/'HOD'|'HR'/);
    const approve = source.slice(source.indexOf("@Post(':targetUserId/approve')", classStart));
    expect(approve).toContain("@Roles('HRAdmin')");
    const reject = source.slice(source.indexOf("@Post(':targetUserId/reject')", classStart));
    expect(reject).toContain("@Roles('HRAdmin')");
  });
});

describe('StaffProfileReviewAdminController authorization', () => {
  it('reserves Pharmacy recheck preparation and decisions for HR Admin', () => {
    const source = readFileSync(
      join(__dirname, 'staff-profile-review.controller.ts'),
      'utf8',
    );
    const routes = [
      "@Get('pharmacy/departments')",
      "@Get('pharmacy/preview')",
      "@Post('pharmacy/reopen')",
      "@Post(':reviewId/return')",
      "@Post(':reviewId/approve')",
    ];

    for (const route of routes) {
      const start = source.indexOf(route);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(source.slice(start, start + 100)).toContain("@Roles('HRAdmin')");
    }
  });
});
