module.exports = {
  apps: [
    {
      name: 'gonggu',
      script: 'node_modules/.bin/next',
      args: 'start -p 3002',
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
    },
  ],
}
