// pm2 process config. Build first (`npm run build`), then `pm2 start ecosystem.config.cjs`.
// This runs the production Node entry (serve.js), which serves the built handler.
module.exports = {
  apps: [
    {
      name: "pickleball-stack",
      script: "serve.js",
      cwd: __dirname,
      // SQLite via better-sqlite3 is a single-writer file — do NOT cluster it.
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        // Resolved relative to cwd (the project root, set above).
        DATABASE_URL: "file:./dev.db",
      },
    },
  ],
};
