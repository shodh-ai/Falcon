import {
  buildDeanUser,
  buildExamCellUser,
  buildFacultyUser,
  buildHodUser,
  buildUser,
} from '../../factories/user.factory';

describe('user.factory coverage', () => {
  it('builds faculty and exam cell personas', () => {
    expect(buildFacultyUser().role).toBe('Faculty');
    expect(buildExamCellUser('examadmin').role).toBe('examadmin');
  });

  it('builds HOD with department', () => {
    expect(buildHodUser(42).dept_id).toBe(42);
  });

  it('builds dean with overrides', () => {
    expect(buildDeanUser({ name: 'Dean Test' }).name).toBe('Dean Test');
  });

  it('merges generic overrides', () => {
    expect(buildUser({ role: 'Custom' }).role).toBe('Custom');
  });
});
