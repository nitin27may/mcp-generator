/**
 * TIP §11.3 / BRD FR-PKG-007: validate the *user's* chosen package identity —
 * never derive it from platform branding (BR-011), never silently rewrite an
 * invalid value.
 */

// Lowercase, no leading dot/underscore, optional @scope/ prefix — the rules
// FR-PKG-007 states explicitly.
const SEGMENT = '[a-z0-9-][a-z0-9-._]*';
const NPM_PACKAGE_NAME = new RegExp(`^(?:@${SEGMENT}/)?${SEGMENT}$`);
const NPM_MAX_LENGTH = 214;

export function isValidNpmPackageName(name: string): boolean {
  if (name.length === 0 || name.length > NPM_MAX_LENGTH) return false;
  if (name !== name.toLowerCase()) return false;
  return NPM_PACKAGE_NAME.test(name);
}

// POSIX-portable command name: letters, digits, dot, hyphen, underscore.
const BIN_NAME = /^[A-Za-z0-9._-]{1,64}$/;

export function isValidBinName(name: string): boolean {
  return BIN_NAME.test(name);
}
