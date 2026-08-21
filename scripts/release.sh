#!/usr/bin/env bash
# Builds, verifies, and packs @nitin27may/mcpgen for npm — version -> full verification chain ->
# staged publish manifest -> npm pack -> a real install-and-run of the packed tarball. The live
# `npm publish` step only runs when neither --dry-run nor --pack-only is passed; until the
# maintainer's npm account is set up for publishing (a granular access token scoped to
# @nitin27may/*, and the account's 2FA mode set to "auth only" — a token cannot publish under
# "auth and writes"), always run this with --dry-run. See docs/CONTRIBUTING.md.
#
# Usage: scripts/release.sh <version|major|minor|patch|prerelease> [--dry-run] [--pack-only] [--tag <dist-tag>]
#   --dry-run    run everything through `npm publish --dry-run`, never a real publish
#   --pack-only  stop after `npm pack` — no publish attempt at all, dry or otherwise
#   --tag        the npm dist-tag a real publish would use (default: latest)
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"

VERSION_ARG=""
DRY_RUN=false
PACK_ONLY=false
DIST_TAG="latest"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --pack-only) PACK_ONLY=true; shift ;;
    --tag) DIST_TAG="$2"; shift 2 ;;
    -*) echo "Unknown flag: $1" >&2; exit 2 ;;
    *)
      if [ -n "$VERSION_ARG" ]; then echo "Only one version argument is allowed, got a second: $1" >&2; exit 2; fi
      VERSION_ARG="$1"
      shift
      ;;
  esac
done

if [ -z "$VERSION_ARG" ]; then
  echo "Usage: scripts/release.sh <version|major|minor|patch|prerelease> [--dry-run] [--pack-only] [--tag <dist-tag>]" >&2
  exit 2
fi

echo "==> Preconditions"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean. Commit or stash changes before releasing." >&2
  git status --short >&2
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "On branch \"$CURRENT_BRANCH\", not main. Releases are cut from main." >&2
  exit 1
fi

PINNED_NODE="$(cat .nvmrc | tr -d '[:space:]')"
CURRENT_NODE="$(node -v | sed 's/^v//' | cut -d. -f1)"
if [ "$CURRENT_NODE" != "$PINNED_NODE" ]; then
  echo "Node major version mismatch: .nvmrc pins $PINNED_NODE, running $CURRENT_NODE." >&2
  exit 1
fi

if [ "$DRY_RUN" = false ] && [ "$PACK_ONLY" = false ]; then
  if ! npm whoami >/dev/null 2>&1; then
    echo "Not logged in to npm (npm whoami failed). A real publish needs a real npm session." >&2
    echo "This is expected until the maintainer's npm account is set up — see docs/CONTRIBUTING.md." >&2
    exit 1
  fi
fi

echo "==> Resolving version"

# The only version that ever mattered is the published CLI's — every workspace package stays
# 0.0.0 forever (private, never published; bumping them is pure git-diff churn for no reader).
# Source of truth is a git tag, not a tracked file, so a release is tag -> build -> publish with
# no version-bump commit to review.
LAST_TAG="$(git tag -l 'v*' --sort=-v:refname | head -1 || true)"
LAST_VERSION="${LAST_TAG#v}"
LAST_VERSION="${LAST_VERSION:-0.0.0}"

VERSION="$(node -e "
const semverBumpKeywords = ['major', 'minor', 'patch', 'prerelease'];
const arg = process.argv[1];
const last = process.argv[2];
if (!semverBumpKeywords.includes(arg)) {
  process.stdout.write(arg); // an explicit version string, e.g. 0.1.0-rc.0
  process.exit(0);
}
const [core, pre] = last.split('-');
let [major, minor, patch] = core.split('.').map(Number);
if (arg === 'major') { major++; minor = 0; patch = 0; }
else if (arg === 'minor') { minor++; patch = 0; }
else if (arg === 'patch') { patch++; }
else if (arg === 'prerelease') {
  if (pre === undefined) { patch++; process.stdout.write(\`\${major}.\${minor}.\${patch}-rc.0\`); process.exit(0); }
  const rcNum = Number(pre.split('.')[1] ?? '0') + 1;
  process.stdout.write(\`\${major}.\${minor}.\${patch}-rc.\${rcNum}\`);
  process.exit(0);
}
process.stdout.write(\`\${major}.\${minor}.\${patch}\`);
" "$VERSION_ARG" "$LAST_VERSION")"

echo "    Last tagged version: v$LAST_VERSION"
echo "    Releasing:           v$VERSION"

# Read by apps/cli/scripts/build.mjs's esbuild `define`, baking the real version into --version's
# output. Declared in turbo.json's build task `env` — an undeclared var here would be silently
# dropped before the build ever saw it, and (worse) absent from turbo's cache key, so a stale
# build from a previous version could be served as if it were this one.
export MCPGEN_VERSION="$VERSION"

echo "==> Verification chain"
# Must be at least as strong as the pull-request gate. It previously skipped typecheck, the
# protocol E2E and the secret scan, which meant a release could ship something CI would have
# refused to merge.
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm run typecheck
pnpm test
pnpm run test:integration
pnpm run test:security
pnpm exec vitest run --project e2e --passWithNoTests
node tooling/scripts/scan-secrets.mjs

echo "==> Staging the publish manifest"
STAGE_DIR="$ROOT/apps/cli/dist-npm"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

node -e "
const fs = require('node:fs');
const template = fs.readFileSync('apps/cli/publish/package.template.json', 'utf8');
fs.writeFileSync('apps/cli/dist-npm/package.json', template.replace('__VERSION__', process.argv[1]));
" "$VERSION"

cp apps/cli/dist/mcpgen.mjs "$STAGE_DIR/"
cp apps/cli/dist/runtime-cli.mjs "$STAGE_DIR/"
# The config JSON Schema ships with the CLI: `mcp.config.json` is the artifact users
# commit, and editor validation of it should not require cloning this repo.
cp schemas/mcp.config.schema.json "$STAGE_DIR/"
cp apps/cli/README.md "$STAGE_DIR/"
cp LICENSE "$STAGE_DIR/"

echo "==> npm pack"
TARBALL="$(cd "$STAGE_DIR" && npm pack --silent)"
TARBALL_PATH="$STAGE_DIR/$TARBALL"
echo "    $TARBALL_PATH"
echo "    Contents:"
tar tzf "$TARBALL_PATH" | sed 's/^/      /'
echo "    Size: $(du -h "$TARBALL_PATH" | cut -f1)"

echo "==> Verifying the tarball installs and runs standalone"
VERIFY_DIR="$(mktemp -d)"
trap 'rm -rf "$VERIFY_DIR"' EXIT

(cd "$VERIFY_DIR" && npm init -y >/dev/null && npm install --no-audit --no-fund "$TARBALL_PATH" >/dev/null)

INSTALLED_VERSION="$("$VERIFY_DIR/node_modules/.bin/mcpgen" --version)"
if [ "$INSTALLED_VERSION" != "$VERSION" ]; then
  echo "Installed binary reports version \"$INSTALLED_VERSION\", expected \"$VERSION\"." >&2
  exit 1
fi

(cd "$VERIFY_DIR" && ./node_modules/.bin/mcpgen init --spec "$ROOT/fixtures/openapi-3.1/customer.json" --enable-read-only >/dev/null)
(cd "$VERIFY_DIR" && ./node_modules/.bin/mcpgen generate --config mcp.config.json --spec "$ROOT/fixtures/openapi-3.1/customer.json" --out generated-server >/dev/null)
(cd "$VERIFY_DIR/generated-server" && npm install --no-audit --no-fund >/dev/null)

echo "    OK — installed from the real tarball, generated a server, installed its dependencies."

if [ "$PACK_ONLY" = true ]; then
  echo "==> --pack-only: stopping here. Tarball at $TARBALL_PATH"
  exit 0
fi

if [ "$DRY_RUN" = true ]; then
  echo "==> Dry run — would publish as @nitin27may/mcpgen@$VERSION on dist-tag \"$DIST_TAG\""
  (cd "$STAGE_DIR" && npm publish --dry-run --tag "$DIST_TAG")
  echo "==> Re-run without --dry-run once npm publishing is set up (docs/CONTRIBUTING.md) to actually publish."
  exit 0
fi

echo "==> Publishing @nitin27may/mcpgen@$VERSION to npm on dist-tag \"$DIST_TAG\""
(cd "$STAGE_DIR" && npm publish --tag "$DIST_TAG")

echo "==> Tagging v$VERSION (after a successful publish, so a failed publish never leaves a claim behind)"
git tag "v$VERSION"
git push origin "v$VERSION"

echo "==> Done. Published @nitin27may/mcpgen@$VERSION."
