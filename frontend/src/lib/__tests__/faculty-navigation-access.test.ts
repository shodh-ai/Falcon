import { describe, expect, it } from 'vitest';
import {
  facultyPortal,
  filterFacultyPortalForEventCoordinator,
} from '@/lib/navigation';

describe('faculty navigation access', () => {
  it('hides event approval from ordinary faculty', () => {
    const config = filterFacultyPortalForEventCoordinator(facultyPortal, false);
    expect(
      config.navGroups.flatMap((group) => group.items).some(
        (item) => item.href === '/faculty/event-approvals',
      ),
    ).toBe(false);
    expect(
      config.commandItems.some(
        (item) => item.href === '/faculty/event-approvals',
      ),
    ).toBe(false);
  });

  it('keeps event approval for assigned coordinators', () => {
    const config = filterFacultyPortalForEventCoordinator(facultyPortal, true);
    expect(
      config.navGroups.flatMap((group) => group.items).some(
        (item) => item.href === '/faculty/event-approvals',
      ),
    ).toBe(true);
  });

  it('exposes one timetable entry in the faculty sidebar', () => {
    const timetableEntries = facultyPortal.navGroups
      .flatMap((group) => group.items)
      .filter((item) =>
        ['/faculty/timetable', '/faculty/schedule-classes'].includes(item.href),
      );
    expect(timetableEntries.map((item) => item.href)).toEqual([
      '/faculty/timetable',
    ]);
  });
});
