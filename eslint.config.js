import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["packages/ledger/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(^|/)apps/|^@jekro/(api|web|worker)(/|$)",
              message: "The ledger must not depend on application code.",
            },
          ],
        },
      ],
    },
  },
);
