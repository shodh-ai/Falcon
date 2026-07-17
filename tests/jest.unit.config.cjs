/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>', '<rootDir>/../backend/src'],
  testMatch: ['<rootDir>/unit/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  globalSetup: '<rootDir>/jest.global-setup.cjs',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  collectCoverageFrom: [
    'helpers/workflow-states.ts',
    'helpers/rbac-matrix.ts',
    'helpers/workflow-routes.ts',
    'factories/**/*.ts',
    '!**/*.spec.ts',
  ],
  coverageDirectory: '<rootDir>/coverage/unit',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90,
    },
  },
  testTimeout: 15000,
};
