import { finalHrReviewSql } from './hr-final-review.sql';

describe('final HR review predicate', () => {
  it('does not turn a dual-role reporting manager into the final HR approver', () => {
    const sql = finalHrReviewSql('request', 'hr_step');
    expect(sql).toContain("hr_step.approver_type IN ('HR_ADMIN', 'HR_EXECUTIVE')");
    expect(sql).toContain("hr_step.approver_type = 'ROLE'");
    expect(sql).not.toContain('REPORTING_MANAGER');
    expect(sql).toContain('later_step.step_order > request.current_step_order');
  });

  it('permits HOD-approved legacy requests and direct HR fallback step two', () => {
    const sql = finalHrReviewSql('request', 'hr_step');
    expect(sql).toContain('request.workflow_id IS NULL');
    expect(sql).toContain('request.current_step_order = 2');
    expect(sql).toContain("request.status IN ('PENDING', 'HOD_APPROVED')");
  });
});
