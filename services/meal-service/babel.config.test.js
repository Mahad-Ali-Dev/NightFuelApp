// Test-only Babel config consumed by babel-jest (see jest.config.js).
// Strips TypeScript types and converts ESM `import`/`export` to CommonJS so
// Jest can run the *.ts test suites without ts-jest. No preset-env is needed
// because tests execute on the current Node runtime. This file is intentionally
// excluded from the service tsconfig build (.js, outside src/).
module.exports = {
    presets: ['@babel/preset-typescript'],
    plugins: ['@babel/plugin-transform-modules-commonjs'],
};
