import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { HrFacultyPortfolioService } from './hr-faculty-portfolio.service';

describe('HrFacultyPortfolioService', () => {
  const tenant = '11111111-1111-4111-8111-111111111111';
  const faculty = '22222222-2222-4222-8222-222222222222';
  const actor = '33333333-3333-4333-8333-333333333333';

  it('rejects a faculty member outside the selected tenant/entity scope', async () => {
    const db = { query: jest.fn().mockResolvedValue([]) };
    const service = new HrFacultyPortfolioService(db as never);
    await expect(service.list(tenant, faculty, 7)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('u.entity_id = $3'), [tenant, faculty, 7]);
  });

  it('projects current skills while preserving all skill changes and completed work', async () => {
    const db = { query: jest.fn()
      .mockResolvedValueOnce([{ user_id: faculty }])
      .mockResolvedValueOnce([
        { event_id: '1', event_type: 'SKILL_ADDED', skill_keyword: 'Research' },
        { event_id: '2', event_type: 'SKILL_REMOVED', skill_keyword: 'Research' },
        { event_id: '3', event_type: 'SKILL_ADDED', skill_keyword: 'Mentoring' },
        { event_id: '4', event_type: 'WORK_COMPLETED', title: 'New course' },
      ]) };
    const service = new HrFacultyPortfolioService(db as never);
    const result = await service.list(tenant, faculty);
    expect(result.skills).toEqual(['Mentoring']);
    expect(result.work).toHaveLength(1);
    expect(result.history).toHaveLength(3);
  });

  it('does not allow a changed retry or a future work date', async () => {
    const db = { query: jest.fn()
      .mockResolvedValueOnce([{ user_id: faculty }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ faculty_user_id: faculty, event_type: 'SKILL_ADDED', skill_keyword: 'Teaching' }]) };
    const service = new HrFacultyPortfolioService(db as never);
    await expect(service.addSkill(tenant, faculty, actor, 'Research', 'same-key'))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(service.addWork(tenant, faculty, actor, {
      work_type: 'TEACHING', title: 'Future work', completed_on: '2999-01-01',
    }, 'other-key')).rejects.toBeInstanceOf(BadRequestException);
  });
});
