/** Component and hook tests under the jest-expo preset for React Native. */
module.exports = {
  displayName: 'native',
  preset: 'jest-expo',
  roots: ['<rootDir>/src'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '\\.node\\.test\\.ts$'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.native.ts'],
};
