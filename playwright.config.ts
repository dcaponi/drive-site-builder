import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	timeout: 30000,
	retries: 0,
	workers: 1,
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry'
	},
	webServer: {
		command: 'TEST_MODE=1 JWT_SECRET=test-secret npm run build && TEST_MODE=1 JWT_SECRET=test-secret npm run preview -- --port 4173',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 120000,
		env: {
			TEST_MODE: '1',
			JWT_SECRET: 'test-secret'
		}
	}
});
