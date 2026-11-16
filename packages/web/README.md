# @quietvote/web

See docs/08-architecture-deployment.md and docs/30-engineering-standards.md.

Run `QV_REQUIRE_BROWSER=1 npm run e2e:server -w @quietvote/web` from the repository root after `npm ci --ignore-scripts` and `npx playwright install --with-deps chromium`.
This bounded acceptance test serves a fresh production build from the actual HTTP server. It runs the existing trustee ceremony and voter enrollment fixture, imports that enrolled key into Chromium without registering again, casts one ballot, and checks its receipt against the server's signed checkpoint and inclusion proof. It also tests the web signed-request adapter against real management endpoints, accepting the correct audience and rejecting another audience. No API responses are stubbed or intercepted. Registration fixture bytes are unchanged; this does not qualify the held browser registration flow.

The required browser CI runner includes this journey alongside the five existing journeys. `QV_CHROMIUM` can select an installed Chromium binary. Missing tooling fails when `QV_REQUIRE_BROWSER=1`; browser launch failures always fail. To run only the HTTP signed-adapter acceptance without launching Chromium: `node --test --test-name-pattern="signed client" packages/web/e2e/server.ts`.
