// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'ios/*', 'android/*', '.expo/*'],
  },
  {
    // Helper scripts and Jest configs run in plain CommonJS Node.
    files: ['scripts/**/*.js', 'jest.*.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: { __dirname: 'readonly', module: 'writable', require: 'readonly', process: 'readonly', console: 'readonly' },
    },
  },
]);
