// Lint is the second line; the first is tsc. What is worth encoding here are
// the rules specific to *this* console — the ones whose violation ships a
// broken page inside someone's binary rather than merely a smell.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Upstream strings (tool names, descriptions, errors) come from
      // federated servers and are untrusted. JSX escapes text children; this
      // is the one escape hatch that would turn a hostile upstream into script
      // execution on the gateway's own origin, next to the operator's token.
      'react/no-danger': 'off', // (no react plugin — enforced by the CI grep)
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message: 'Upstream-controlled strings are untrusted — render them as text children.',
        },
        {
          selector: 'JSXAttribute[name.name="style"]',
          message:
            "The shipped CSP is `default-src 'self'` with no 'unsafe-inline', which blocks style attributes. Use a class.",
        },
        {
          // Preact translates `class` on DOM elements, but a component prop
          // named `class` is just an unknown prop — TanStack's <Link> wants
          // className, and silently drops class. This cost one round of
          // "why is the header unstyled".
          selector: 'JSXElement[openingElement.name.name="Link"] > JSXOpeningElement > JSXAttribute[name.name="class"]',
          message: 'Use className on <Link>: it is a component, so Preact does not translate `class`.',
        },
      ],
    },
  },
)
