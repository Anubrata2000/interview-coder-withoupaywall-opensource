import js from "@eslint/js";
import globals from "globals";
import tseslintPlugin from "@typescript-eslint/eslint-plugin";
import tseslintParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "dist/**",
      "dist-electron/**",
      "node_modules/**",
      "release/**",
      "**/*.d.ts",
      "package-lock.json",
      "package.json",
      "**/*.json",
      "**/*.css",
      "**/*.md"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: tseslintParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      "@typescript-eslint": tseslintPlugin
    },
    rules: {
      ...tseslintPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "no-unused-vars": "off",
      "no-undef": "off",
      "no-useless-escape": "warn"
    }
  }
];
