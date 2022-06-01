module.exports = {
  "env": {
      "browser": true,
      "es6": true,
      "node": true
  },
  "ignorePatterns": [
      "dist",
      "node_modules",
      "src/generated",
      "**/__tests__/*",
      "**/__mocks__/*",
      "Dangerfile.*",
      "*.d.ts",
      ".eslintrc.js",
      "jest.config.js"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
      "project": "tsconfig.json",
      "sourceType": "module"
  },
  "extends": [
      "@pagopa/eslint-config/strong",
  ],
  "rules": {}
}
