/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/integration/**/*.integration.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  globalSetup: '<rootDir>/jest.integration-global-setup.cjs',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  collectCoverageFrom: ['mocks/api-gateway.mock.ts'],
  coverageDirectory: '<rootDir>/coverage/integration',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 80,
      functions: 85,
      lines: 90,
    },
  },
  testTimeout: 30000,
};
