import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminControlService } from './admin-control.service';

describe('Course deletion material preservation', () => {
  function fixture(materials: unknown[]) {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ course_id: 'course' }])
        .mockResolvedValueOnce(materials)
        .mockResolvedValueOnce([]),
    };
    const db = {
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn(
        async (run: (value: typeof manager) => Promise<unknown>) =>
          run(manager),
      ),
    };
    const target = new AdminControlService(
      db as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { target, db, manager };
  }

  it.each([null, new Date('2026-10-23T00:00:00Z')])(
    'blocks deletion when material deleted_at is %p',
    async (deletedAt) => {
      const { target, db, manager } = fixture([
        { material_id: 'material', deleted_at: deletedAt },
      ]);
      await expect(
        target.deleteCourse('tenant', 'actor', 'course'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(manager.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('FOR UPDATE'),
        ['tenant', 'course'],
      );
      expect(manager.query).toHaveBeenNthCalledWith(
        2,
        expect.not.stringContaining('deleted_at IS NULL'),
        ['tenant', 'course'],
      );
      expect(manager.query).toHaveBeenCalledTimes(2);
      expect(db.query).not.toHaveBeenCalled();
    },
  );

  it('preserves deletion and audit for an empty course', async () => {
    const { target, db, manager } = fixture([]);
    await expect(
      target.deleteCourse('tenant', 'actor', 'course'),
    ).resolves.toEqual({ deleted: true, course_id: 'course' });
    expect(manager.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('DELETE FROM academic_courses'),
      ['tenant', 'course'],
    );
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('rejects a course outside the tenant before checking materials', async () => {
    const { target, manager } = fixture([]);
    manager.query.mockReset().mockResolvedValueOnce([]);
    await expect(
      target.deleteCourse('other-tenant', 'actor', 'course'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE tenant_id = $1 AND course_id = $2'),
      ['other-tenant', 'course'],
    );
  });
});
