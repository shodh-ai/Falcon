import fixtureUsers from '../fixtures/users.json';

export const TEST_PASSWORD =
  process.env.FALCON_TEST_PASSWORD ?? fixtureUsers.defaultPassword;

export const TEST_USERS = {
  faculty: {
    email: process.env.FALCON_TEST_FACULTY_EMAIL ?? fixtureUsers.faculty.email,
    role: fixtureUsers.faculty.role,
  },
  hod: {
    email: process.env.FALCON_TEST_HOD_EMAIL ?? fixtureUsers.hod.email,
    role: fixtureUsers.hod.role,
  },
  hodMech: {
    email: fixtureUsers.hodMech.email,
    role: fixtureUsers.hodMech.role,
  },
  dean: {
    email: process.env.FALCON_TEST_DEAN_EMAIL ?? fixtureUsers.dean.email,
    role: fixtureUsers.dean.role,
  },
  examcell: {
    email: process.env.FALCON_TEST_EXAMCELL_EMAIL ?? fixtureUsers.examcell.email,
    role: fixtureUsers.examcell.role,
  },
  examadmin: {
    email: fixtureUsers.examadmin.email,
    role: fixtureUsers.examadmin.role,
  },
  examoperator: {
    email: fixtureUsers.examoperator.email,
    role: fixtureUsers.examoperator.role,
  },
  superadmin: {
    email: fixtureUsers.superadmin.email,
    role: fixtureUsers.superadmin.role,
  },
  registrar: {
    email: process.env.FALCON_TEST_REGISTRAR_EMAIL ?? fixtureUsers.registrar.email,
    role: fixtureUsers.registrar.role,
  },
  president: {
    email: process.env.FALCON_TEST_PRESIDENT_EMAIL ?? fixtureUsers.president?.email ?? 'president@mygyanvihar.com',
    role: 'President',
  },
} as const;

export type TestUserKey = keyof typeof TEST_USERS;
