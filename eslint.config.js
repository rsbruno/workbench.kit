import perfectionist from "eslint-plugin-perfectionist";
import tseslint from "typescript-eslint";
import globals from "globals";
import js from "@eslint/js";

export default tseslint.config(
  {
    ignores: ["node_modules/**", "dist/**", ".husky/**", ".vscode/**"]
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { destructuredArrayIgnorePattern: "^_" }],
      "perfectionist/sort-named-imports": ["error", { type: "line-length", order: "desc" }],
      "perfectionist/sort-interfaces": ["error", { type: "line-length", order: "desc" }],
      "perfectionist/sort-imports": ["error", { type: "line-length", order: "desc" }],
      "perfectionist/sort-exports": ["error", { type: "line-length", order: "desc" }],
      "perfectionist/sort-objects": ["error", { type: "line-length", order: "desc" }],
      "perfectionist/sort-enums": ["error", { type: "line-length", order: "desc" }],
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "perfectionist/sort-maps": "off",
      "no-case-declarations": "off",
      "no-param-reassign": "off",
      "no-console": "off"
    },

    languageOptions: {
      globals: globals.node,
      sourceType: "module",
      ecmaVersion: 2022
    },

    plugins: {
      perfectionist
    },

    extends: [js.configs.recommended, ...tseslint.configs.recommended],

    files: ["**/*.{ts,js}"]
  },
  {
    ignores: ["eslint.config.js", "prettier.config.js"]
  }
);
