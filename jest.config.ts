/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  slowTestThreshold: 30000, // do not complain if test run less then 30s, because it's integration tests
  rootDir: '.',
  moduleNameMapper: {
    '~/(.*)': '<rootDir>/src/$1',
  },
}
