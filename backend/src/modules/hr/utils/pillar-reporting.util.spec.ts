import {
  auditorMustReportToChairman,
  financeReportsToCoo,
  pillarOfRole,
  procurementReportsToStoresOrViceVersa,
  procurementStoresShareManager,
  validatePillarReporting,
} from './pillar-reporting.util';

describe('pillar-reporting.util', () => {
  it('maps pillars', () => {
    expect(pillarOfRole('CFO')).toBe('FINANCE');
    expect(pillarOfRole('COO')).toBe('OPERATIONS');
    expect(pillarOfRole('HOD')).toBe('ACADEMIC');
  });

  it('blocks finance reporting to COO chain', () => {
    expect(financeReportsToCoo('APManager', ['CFO', 'COO'])).toBe(true);
    expect(financeReportsToCoo('APManager', ['CFO', 'Chairman'])).toBe(false);
  });

  it('blocks procurement/stores shared manager', () => {
    expect(
      procurementStoresShareManager('ProcurementBuyer', 'm1', [
        { role_name: 'Stores' },
      ]),
    ).toBe(true);
    expect(
      procurementStoresShareManager('ProcurementBuyer', 'm1', [
        { role_name: 'ProcurementHead' },
      ]),
    ).toBe(false);
  });

  it('blocks cross report', () => {
    expect(procurementReportsToStoresOrViceVersa('Procurement', 'Stores')).toBe(
      true,
    );
  });

  it('requires auditor → chairman', () => {
    expect(auditorMustReportToChairman('InternalAuditor', 'COO')).toBe(true);
    expect(auditorMustReportToChairman('InternalAuditor', 'Chairman')).toBe(
      false,
    );
  });

  it('validatePillarReporting aggregates', () => {
    const v = validatePillarReporting({
      subjectRole: 'CFO',
      officerRole: 'COO',
      officerChainRoles: ['COO'],
      managerId: 'coo',
      peersUnderSameManager: [],
    });
    expect(v?.code).toBe('FINANCE_REPORTS_TO_COO');
  });
});
