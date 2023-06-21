module.exports = {
  roots: ["<rootDir>"],
  extensionsToTreatAsEsm: ['.ts'],
  verbose: true,
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  modulePathIgnorePatterns: ["<rootDir>/node_modules", "<rootDir>/dist"],
  moduleFileExtensions: ["ts", "js", "json"],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testRegex: ".*\\.Test\\.ts$",
  transform: { "^.+\\.ts$": ["ts-jest", { useESM: true }] }
};