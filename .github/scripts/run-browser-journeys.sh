#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# @verifies QV-30-REQ-014
# Run from the repository root after installing the pinned browser tooling.
# Preserve every independent journey's evidence when another journey fails.
set -u
export QV_REQUIRE_BROWSER=1
rc=0
for journey in run help a11y verifier spoil-shares; do
  echo "::group::Browser journey: $journey"
  node "packages/web/e2e/$journey.ts" || {
    rc=1
    echo "::error::Browser journey failed: $journey"
  }
  echo "::endgroup::"
done
exit "$rc"
