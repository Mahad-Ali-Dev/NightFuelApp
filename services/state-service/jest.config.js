// Dev-only Jest harness for state-service. Uses babel-jest (NOT ts-jest) with the
// test-only babel.config.test.js to transpile *.ts suites. All tooling
// (jest, babel-jest, @babel/preset-typescript, @babel/plugin-transform-modules-commonjs)
// is already hoisted at the repo-root node_modules — no new installs.
module.exports = {
    rootDir: '.',
    roots: ['<rootDir>/__tests__'],
    testMatch: ['**/*.test.ts'],
    transform: {
        '^.+\\.ts$': ['babel-jest', { configFile: './babel.config.test.js' }],
    },
    testEnvironment: 'node',
};
