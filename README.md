# New Project Ignition Backend

A small JavaScript and Express starter for personal projects: study planners, habit trackers, expense trackers, meal planners, and dashboards. Features live together, with clear boundaries between HTTP handling, business rules, and storage.

## Get started

Use the latest patched **Node.js 24 LTS** release (recommended), or a patched **Node.js 22 LTS** release at least 22.19.0. `.nvmrc` selects Node 24 when using a compatible version manager. npm comes with Node.

```powershell
git clone https://github.com/ahmedsamy13/new-project-ignition-back-end-.git
cd new-project-ignition-back-end-
npm ci
Copy-Item .env.example .env
npm run dev
```

On macOS or Linux, use `cp .env.example .env` for the copy step. For a freshly generated starter without a lockfile, use `npm install` once. This repository includes `package-lock.json`, so `npm ci` installs the locked versions.

The default address is `http://127.0.0.1:3000`. `npm run dev` uses Node's built-in watch mode. `npm start` runs without watching. Node loads `.env` if present; variables already set in your shell take precedence. You can run with the safe defaults without creating `.env`.

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/v1/items -ContentType 'application/json' -Body '{"name":"Read a chapter"}'
Invoke-RestMethod 'http://127.0.0.1:3000/api/v1/items?limit=20&offset=0'
```

## Folder structure

```text
.
├── .env.example                 Safe configuration examples
├── .gitignore                   Excludes secrets and generated files
├── .nvmrc                       Recommended Node major version
├── package.json                 ES modules, scripts, dependencies
├── package-lock.json            Reproducible dependency versions
├── README.md
├── docs/
│   ├── architecture.md          Boundaries and extension guide
│   └── openapi.json             Example API contract (OpenAPI 3.1)
├── src/
│   ├── app.js                   Builds the app and orders middleware
│   ├── server.js                Configuration, listening, shutdown
│   ├── config/
│   │   └── env.js               Validates and exposes configuration
│   ├── features/
│   │   └── items/
│   │       ├── items.routes.js       Router and feature wiring
│   │       ├── items.schemas.js      Body, query, and parameter validation
│   │       ├── items.controller.js   HTTP requests and responses
│   │       ├── items.service.js      Business rules
│   │       └── items.repository.js   Temporary data access
│   ├── middleware/
│   │   ├── request-context.js   Request IDs and safe completion logs
│   │   ├── validate.js          Validated inputs and JSON content type
│   │   ├── not-found.js         Unknown endpoint handling
│   │   └── error-handler.js     Consistent, safe error responses
│   └── shared/
│       ├── app-error.js         Errors with explicitly public messages
│       └── logger.js            Structured JSON logging
└── test/
    └── app.test.js              API and security regression checks
```

There are no empty future folders. Add a shared utility only when multiple features actually need it. See [architecture](docs/architecture.md) for the request diagram and dependency rules.

## Example API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Returns only `status: "ok"` |
| GET | `/api/v1/items` | Lists items; `limit` defaults to 20 (maximum 100), `offset` defaults to 0 |
| POST | `/api/v1/items` | Creates an item from `{ "name": "Read a chapter" }` |
| GET | `/api/v1/items/:id` | Retrieves an item by UUID |

The example accepts only its documented fields. Names are trimmed and must contain 1–100 characters. Query values must be whole non-negative decimal numbers within their documented bounds. Creation requires `Content-Type: application/json`.

**The item store is an example:** data exists only in one running app instance, disappears on restart, and is capped at 1,000 items to bound memory use. Separate processes have separate stores. It has no authentication and must be adapted before holding private data or serving public traffic. Replace the repository with persistent storage when your project needs it.

The contract is [docs/openapi.json](docs/openapi.json). It documents the endpoints, schemas, pagination, and error codes. Update the contract and the relevant checks whenever an endpoint changes. It is a local document; the server does not publish a documentation UI.

## Request flow and responses

Requests receive a server-generated ID, security headers, and the configured CORS policy. JSON parsing enforces the body size limit. The feature router validates inputs into `res.locals.validated`; controllers call services, and services call repositories. Unknown routes and failures reach the final error middleware. Express 5 forwards rejected promises from async controllers automatically.

Success responses use `{ "success": true, "data": ... }`. Lists also include `meta` with `limit`, `offset`, and `total`. Creation returns HTTP 201 and a `Location` header. Errors use:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [{ "field": "name", "message": "A validation explanation" }]
  },
  "requestId": "f213899d-a2ca-4c2f-a5ef-4f7c4a6fb975"
}
```

`details` appears only for validation failures. Every app response gets `X-Request-Id` and `Cache-Control: no-store`. Unexpected errors always return a generic 500 response; their raw messages and stacks are excluded from both API responses and logs in every environment. `AppError` messages are intentionally public, so never put secrets in them. Invalid JSON returns 400, oversized bodies 413, and unsupported content types, encodings, or charsets 415.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, or `production` |
| `HOST` | `127.0.0.1` | `localhost` or a valid IP; localhost binding keeps the app local |
| `PORT` | `3000` | Integer from 1 to 65535 |
| `CORS_ORIGINS` | Empty | Exact allowed HTTP/HTTPS origins, comma-separated; no wildcard, paths, or trailing slash |
| `JSON_BODY_LIMIT` | `16384` | Maximum JSON body bytes; allowed range 1024–1048576 |
| `TRUST_PROXY` | `false` | Disabled, or comma-separated trusted proxy IPs/CIDRs |

Invalid settings stop startup before the server listens. Only invalid field names are logged. `.env` stays outside Git; `.env.example` contains no credentials.

For a frontend running at `http://localhost:5173`, set `CORS_ORIGINS=http://localhost:5173`. The `localhost` and `127.0.0.1` origins are different. Cross-origin requests from unlisted origins return 403. Requests without an `Origin` header, such as ordinary CLI requests, are allowed. CORS is a browser policy, not authentication or authorization. Credentialed CORS is disabled; review this when adding cookie authentication.

Keep `TRUST_PROXY=false` unless you know the actual proxy topology. If a proxy is present, configure only its known IP addresses or CIDRs and ensure it overwrites forwarded headers. For a proxy connecting from local loopback, an explicit example is `TRUST_PROXY=127.0.0.1,::1`. Do not broadly trust all proxies or set a guessed hop count. See [Express proxy guidance](https://expressjs.com/en/guide/behind-proxies/).

## Add a feature

1. Create `src/features/habits/` (or your feature name) using the items files as a small example.
2. Define the accepted body, params, or query in `habits.schemas.js`. Attach `validate(schema, source)` to its route and read the parsed data from `res.locals.validated`.
3. Keep HTTP status codes, headers, and response shapes in the controller. Put business decisions in the service. Put database queries or other storage operations in the repository.
4. Export a router and mount it once in `app.js`, for example `app.use('/api/v1/habits', createHabitsRouter())`, before the not-found handler.
5. Document the new endpoint in `docs/openapi.json` and add meaningful checks for its behavior.

For a new route in an existing feature, add its schema and controller method, attach them to the feature router, and add a service or repository method only if the behavior needs one. Use explicit file imports with `.js` extensions.

## Dependencies

| Package | Purpose |
| --- | --- |
| Express | Routing, middleware, JSON parsing, HTTP responses |
| Helmet | Security response headers |
| CORS | Origin allowlist and browser preflight handling |
| Zod | Runtime environment and request validation in JavaScript |

Node provides environment loading, watch mode, UUIDs, HTTP, and the test runner. No development dependencies are needed. Direct dependencies are pinned; the lockfile records transitive versions. Review dependency updates deliberately and run `npm audit` regularly.

## Checks and growing the project

```powershell
npm test
npm audit
```

The regression checks exercise a real local HTTP server, validation, errors, security headers, CORS, privacy of logs, and isolation of the example storage. They use random local ports and do not call external APIs or require Postman.

Before deployment, use patched LTS Node and dependencies, set `NODE_ENV=production`, configure HTTPS at the hosting layer, choose the appropriate binding and frontend origins, and configure proxy trust only for a known setup. Add authentication and ownership checks before storing personal information. Choose request rate limits for actual traffic and protect sensitive endpoints. The server uses finite request/header timeouts and attempts to drain requests for up to 10 seconds on shutdown.

When adding a database, put connection configuration in `src/config/` and queries in each feature's repository; add models and migrations only for the chosen database. Authentication can become its own feature with shared route protection middleware. External clients, uploads, jobs, and caches get dedicated modules when needed. A database or shared store is required before the example can run across multiple instances; the folder structure alone does not provide that scaling.

Version and security choices were checked on October 14, 2026 against [Node releases](https://nodejs.org/en/about/previous-releases), the official [Express security guide](https://expressjs.com/en/advanced/best-practice-security/), [Express 5 error handling](https://expressjs.com/en/5x/guide/error-handling/), and the npm registry. Express 5.3.0 was the current stable published release at setup time.
