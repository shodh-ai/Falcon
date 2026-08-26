import { AnnouncementsService } from './announcements.service';

describe('AnnouncementsService', () => {
  const dataSource = { query: jest.fn() };
  const campusScope = {
    resolveCampusIds: jest.fn(),
    departmentIdsForCampuses: jest.fn(),
    studentCampusVisibilityClause: jest.fn(
      () => '(s.campus_id = ANY($2::int[]))',
    ),
  };
  const notifications = {
    create: jest.fn(),
  };
  let service: AnnouncementsService;

  beforeEach(() => {
    jest.clearAllMocks();
    campusScope.resolveCampusIds.mockResolvedValue(null);
    campusScope.departmentIdsForCampuses.mockResolvedValue([11, 12]);
    notifications.create.mockResolvedValue({});
    service = new AnnouncementsService(
      dataSource as never,
      campusScope as never,
      notifications as never,
    );
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
      ['tenant-1', 'Holiday', '<p>Closed</p>', true, true, 'user-1'],
    );
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('creates campus-scoped announcement and notifies campus audience', async () => {
    campusScope.resolveCampusIds.mockResolvedValueOnce([5]);
    campusScope.departmentIdsForCampuses.mockResolvedValueOnce([11, 12]);
    dataSource.query
      .mockResolvedValueOnce([
        {
          announcement_id: 'a2',
          title: 'Campus note',
          body_html: '<p>Hi</p>',
          target_all_students: false,
        },
      ])
      .mockResolvedValueOnce([{ user_id: 'stu-1' }])
      .mockResolvedValueOnce([{ user_id: 'fac-1' }]);

    const row = await service.create(
      'tenant-1',
      'ca-1',
      {
        title: 'Campus note',
        body_html: '<p>Hi</p>',
        target_dept_ids: [11, 99],
        audience: 'all',
      },
      { user_id: 'ca-1', role: 'CampusAdmin' },
    );

    expect(dataSource.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('false,false'),
      ['tenant-1', 'Campus note', '<p>Hi</p>', [11], 'ca-1'],
    );
    expect(notifications.create).toHaveBeenCalledTimes(2);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'stu-1',
        actionLink: '/announcements/a2',
        metadata: expect.objectContaining({ announcement_id: 'a2' }),
      }),
    );
    expect(row.notified).toBe(2);
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

  it('updates campus-scoped announcement when depts are in scope', async () => {
    campusScope.resolveCampusIds.mockResolvedValueOnce([5]);
    campusScope.departmentIdsForCampuses.mockResolvedValueOnce([11, 12]);
    dataSource.query
      .mockResolvedValueOnce([
        {
          announcement_id: 'a3',
          target_dept_ids: [11],
          target_all_students: false,
          target_all_faculty: false,
        },
      ])
      .mockResolvedValueOnce([{ announcement_id: 'a3', title: 'Updated' }]);

    const row = await service.update(
      'tenant-1',
      'a3',
      { title: 'Updated' },
      { user_id: 'ca-1', role: 'CampusAdmin' },
    );

    expect(row.title).toBe('Updated');
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE campus_announcements'),
      ['tenant-1', 'a3', 'Updated', null, null],
    );
  });

  it('blocks Campus Admin from updating tenant-wide announcements', async () => {
    campusScope.resolveCampusIds.mockResolvedValueOnce([5]);
    dataSource.query.mockResolvedValueOnce([
      {
        announcement_id: 'a4',
        target_dept_ids: [],
        target_all_students: true,
        target_all_faculty: false,
      },
    ]);

    await expect(
      service.update(
        'tenant-1',
        'a4',
        { title: 'Nope' },
        { user_id: 'ca-1', role: 'CampusAdmin' },
      ),
    ).rejects.toThrow(/tenant-wide/);
  });
});
