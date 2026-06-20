import { AnnouncementsService } from './announcements.service';

describe('AnnouncementsService', () => {
  const dataSource = { query: jest.fn() };
  let service: AnnouncementsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnnouncementsService(dataSource as never);
  });

  it('creates global announcement for all students and faculty', async () => {
    dataSource.query.mockResolvedValueOnce([
      { announcement_id: 'a1', title: 'Test' },
    ]);

    const row = await service.create('tenant-1', 'user-1', {
      title: 'Holiday',
      body_html: '<p>Closed</p>',
    });

    expect(row.announcement_id).toBe('a1');
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('target_all_students, target_all_faculty'),
      ['tenant-1', 'Holiday', '<p>Closed</p>', 'user-1'],
    );
  });

  it('lists same feed for every user on tenant (no role filter)', async () => {
    dataSource.query.mockResolvedValueOnce([
      { announcement_id: 'a1' },
      { announcement_id: 'a2' },
    ]);

    const rows = await service.listForUser('tenant-1');

    expect(rows).toHaveLength(2);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE tenant_id = $1 AND is_published = true'),
      ['tenant-1'],
    );
    expect(dataSource.query.mock.calls[0][0]).not.toMatch(
      /target_all_students/,
    );
  });
});
