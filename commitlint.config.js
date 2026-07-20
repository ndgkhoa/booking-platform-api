// Conventional Commits linting. Extends the community preset and additionally
// requires a scope on every commit so history reads `type(scope): subject`
// (e.g. feat(booking): ...). Scope values are intentionally left free-form.
/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // level 2 = error, 'never' empty → a scope is mandatory.
    'scope-empty': [2, 'never'],
  },
};
