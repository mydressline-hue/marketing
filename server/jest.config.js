/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^\\.\\./\\.\\./\\.\\./\\.\\./\\.\\./\\.\\./src/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      diagnostics: false,
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/migrations/**',
    '!src/seeds/**'
  ],
  coverageDirectory: 'coverage',
  testTimeout: 30000
};
