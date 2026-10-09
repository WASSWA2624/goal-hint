import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const privateImports = {
  regex: "(^|/)(server|workers)(/|$)|(^|/)prisma\\.config(\\.|$)",
  message: "Browser components and shared contracts must not import server or worker modules.",
};

const workerImports = {
  regex: "(^|/)workers(/|$)",
  message: "Web modules must use shared server services instead of importing worker entry points.",
};

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([".next/**", "out/**", "build/**", ".tmp/**", "src/server/generated/**", "next-env.d.ts"]),
  {
    files: ["src/{components,domain,styles}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [privateImports] }],
    },
  },
  {
    files: ["src/{app,server}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [workerImports] }],
    },
  },
  {
    files: ["src/{server,workers}/**/*.{ts,tsx}"],
    ignores: ["**/*.d.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            'Program:not(:has(ImportDeclaration[source.value="server-only"][specifiers.length=0][importKind!="type"]))',
          message: 'Server and worker modules must include import "server-only" to protect the client bundle.',
        },
      ],
    },
  },
]);
