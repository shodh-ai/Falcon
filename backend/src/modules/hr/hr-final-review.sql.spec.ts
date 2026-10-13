import { finalHrReviewSql } from './hr-final-review.sql';

describe('final HR review predicate', () => {
  it('does not turn a dual-role reporting manager into the final HR approver', () => {
    const sql = finalHrReviewSql('request', 'hr_step');
    expect(sql).toContain("hr_step.approver_type IN ('HR_ADMIN', 'HR_EXECUTIVE')");
    expect(sql).toContain("hr_step.approver_type = 'ROLE'");
    expect(sql).not.toContain('REPORTING_MANAGER');
    expect(sql).toContain('later_step.step_order > request.current_step_order');
  });

  it('permits only an already HOD-approved legacy request with no workflow', () => {
    const sql = finalHrReviewSql('request', 'hr_step');
    expect(sql).toContain('request.workflow_id IS NULL');
    expect(sql).toContain("request.status = 'HOD_APPROVED'");
    expect(sql).not.toContain("request.status = 'PENDING'");
  });
});
