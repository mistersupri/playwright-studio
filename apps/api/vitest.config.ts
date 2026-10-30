import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      ENCRYPTION_KEY: "test-encryption-key-0123456789abcdef0123456789abcdef",
      AUTH_SECRET: "test-auth-secret-0123456789abcdef0123456789abcdef",
    },
    testTimeout: 30_000,
  },
});
