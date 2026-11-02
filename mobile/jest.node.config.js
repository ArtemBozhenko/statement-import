/**
 * Pure domain and integration tests in plain Node.
 * Integration tests start the real mock server from the untouched kit in `../kit`.
 */
module.exports = {
  displayName: 'node',
  preset: 'jest-expo/node',
  roots: ['<rootDir>/src', '<rootDir>/test/node'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testMatch: ['**/*.node.test.ts'],
};
