import type { Config } from 'jest';
import nextJest from 'next/jest';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: [
    '**/__tests__/**/*.test.{ts,tsx}',
    '**/*.spec.{ts,tsx}',
  ],
  moduleNameMapper: {
    '^@gym/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@/(.*)$': '<rootDir>/$1',
  },
};

export default createJestConfig(config);
