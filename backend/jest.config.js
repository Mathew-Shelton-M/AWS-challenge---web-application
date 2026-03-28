const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env.test') });

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  setupFilesAfterFramework: ['<rootDir>/src/tests/setup.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json',
    },
  },
};
