# Future Admin Login And Web Editing

## Goal

A later Poller Apps release will provide a private `/admin/` area where the owner can sign in and manage portfolio content from a browser.

The editor should manage structured content such as projects, descriptions, status, links, images, ordering, and publication state. It should not edit arbitrary production HTML, CSS, or JavaScript.

## Recommended Architecture

The recommended first implementation stays within the Cloudflare stack used for hosting:

- **Cloudflare Access** handles authentication through an approved identity provider with multi-factor authentication.
- **Access policy** allows only the owner's exact email address to reach `/admin/*` and `/api/admin/*`.
- **Cloudflare Pages Functions** provide authenticated content-management endpoints.
- **Cloudflare D1** stores structured project and site content.
- **Cloudflare R2** stores uploaded screenshots and other media.
- **Cloudflare KV** stores the versioned published-media index.
- **A per-site Durable Object** serializes publishing and stores the active fallback-snapshot version and pointer.
- The public content endpoint is read-only and returns only published records.

This avoids maintaining passwords and password-reset code. Poller Apps must never store an admin password in browser JavaScript, local storage, the Git repository, or a public environment variable. The Cloudflare account and identity-provider account must both have multi-factor authentication and documented recovery methods.

## Authorization

Authentication proves who signed in. Authorization separately decides what that person may do.

Every admin API request, including reads, must cryptographically verify the `CF_Authorization` Access JWT on the server. Verification must use Cloudflare's published JWKS and check the signature, issuer, application audience, expiry, and exact approved identity. An email header by itself is not proof of identity.

Hiding admin buttons in the browser is not authorization. The API must reject missing, expired, or unauthorized identities before reading drafts or changing content. Access sessions should be short-lived, revocable, and restricted to the smallest practical route set.

Version one should support a single `admin` role tied to one email address. Add more roles only if another real editor joins later.

## Initial Content Model

Suggested project fields:

| Field | Purpose |
| --- | --- |
| `id` | Stable internal identifier |
| `slug` | URL-safe project path |
| `title` | Public project name |
| `summary` | Short homepage description |
| `productStatus` | Prototype, available, or archived |
| `type` | App, game, tool, experiment, or case study |
| `launchUrl` | Optional safe public URL |
| `imageKey` | Optional R2 media reference |
| `sortOrder` | Manual homepage ordering |
| `publishedRevisionId` | Explicit pointer to the only publicly readable revision |
| `publishedAt` | Publication timestamp |
| `updatedAt` | Last saved timestamp |

Draft state is separate from product status. Each edit creates or updates a draft revision; publishing atomically changes `publishedRevisionId`. Public queries may read only the revision referenced by that field and must never infer publication from a nullable date or status string.

All text must be escaped when rendered. URLs should allow only expected `https:` links or internal paths.

Uploads require byte-signature type detection, image decode and re-encode, generated object keys, strict size/dimension quotas, and safe response content types. SVG, HTML, and executable formats should be rejected initially. R2 should remain private behind a controlled same-origin delivery route so the current Content Security Policy remains restrictive.

Draft uploads remain under a private `draft/` namespace and are available only through an authenticated admin route with `Cache-Control: private, no-store`. Publishing copies the processed object to an immutable `published/` key and adds that key to a published-media index. The same-origin public media route serves only keys in that index; knowing a draft object key is never sufficient. Unpublishing removes the public index entry while retaining the private object for rollback.

## Public Rendering Decision

When the CMS phase begins, a Pages Function will server-render `/` from a versioned HTML template and the current published revision in D1. Static CSS, JavaScript, images, and embedded apps remain unchanged.

Published HTML may be cached publicly for a short period and explicitly purged after an atomic publish. Draft/admin responses must send `Cache-Control: private, no-store`.

Every successful publish prepares a versioned HTML snapshot in a dedicated private R2 location, then activates its latest-published pointer in the Durable Object only after the D1 publication transaction succeeds. If D1 is unavailable, the public route reads that independently stored snapshot and marks the response as stale. A CDN cache alone is not the outage fallback. A prepared snapshot may render the candidate revision inside the protected publish job, but it is not publicly addressable before the D1 commit.

This choice preserves crawlable project content and link previews; the homepage will not depend on client-side JavaScript to discover its primary content.

## Draft Preview

Draft preview uses an Access-protected route such as `/admin/preview/:revisionId`. The Pages Function verifies the Access JWT, confirms that the requested revision is a draft owned by the current site, and renders it without changing publication state.

Preview responses use `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow`. Preview URLs are never placed in public HTML, sitemaps, social metadata, or analytics. Draft media continues through the authenticated draft-media route rather than the public media path.

## Publish Consistency

D1 is the source of truth for publication. The per-site Durable Object allows only one publish transition at a time and assigns a monotonically increasing `publicationVersion`. Publishing is an idempotent state machine rather than a claim of one transaction across D1, R2, KV, and the CDN:

1. Through the Durable Object, create a `publish_job` with a unique idempotency key, candidate revision, expected current revision, assigned publication version, and `pending` state.
2. Re-encode or copy candidate media to immutable R2 keys, render a versioned R2 snapshot, and mark the job `prepared`. These objects remain private and absent from the public KV index.
3. In one D1 transaction, verify the draft has not changed, set `publishedRevisionId`, record the audit event, and mark the job `committed`. This is the publication boundary.
4. For a committed job, the Durable Object rechecks that D1 still points to that revision and version. It then advances its snapshot pointer, writes version-tagged KV media entries, and requests cache invalidation. A superseded job becomes a no-op.
5. Mark the job `complete` only after all side effects succeed.

If a failure occurs before the D1 commit, the job can retry or be abandoned without changing public content. If D1 commits but a later side effect fails, the public D1-rendered page remains correct while the previous outage snapshot stays active; a queue consumer or scheduled recovery task retries through the same Durable Object until completion. Cache-purge failure may temporarily serve the previous published version but can never expose a draft. Every step checks the job state, immutable revision id, and monotonic publication version, so a delayed older retry cannot overwrite newer snapshot or media state.

## Editing Flow

1. The owner opens `/admin/` and completes Cloudflare Access login.
2. The admin interface requests drafts from an authenticated Pages Function.
3. The server validates the Access JWT before returning any draft data.
4. Edits are validated in the browser for usability and again by the server for security.
5. Saving writes a private, non-cached draft revision to D1.
6. Preview renders that revision through the protected, non-indexable preview route.
7. Publishing runs the idempotent publish state machine; the D1 transaction atomically changes the project's published revision pointer, while snapshot/index updates and cache invalidation are recoverable post-commit side effects.
8. The public renderer queries only published revision pointers and never receives drafts or admin metadata.

## Security Requirements

- Require HTTPS everywhere.
- Restrict Access to the owner's explicit identity rather than any valid Google account.
- Validate the full Access JWT on every admin read and write request.
- Allow mutations only through `POST`, `PUT`, `PATCH`, or `DELETE`; never mutate through `GET`.
- Require a CSRF token or non-simple authorization header, validate the exact `Origin`, and use restrictive same-origin CORS rules.
- Validate all fields and uploaded media server-side.
- Keep previews under Access and send `private, no-store` plus `X-Robots-Tag: noindex, nofollow`.
- Serve public media only when its immutable key exists in the published-media index.
- Rate-limit admin and upload endpoints.
- Keep secrets in Cloudflare encrypted bindings, never source files.
- Record publication changes with timestamp and cryptographically verified actor identity.
- Configure a short Access session, identity-provider MFA, revocation procedure, and account-recovery owner before launch.
- Provide automated D1 export/backup before adding destructive operations.

## Delivery Phases

### Phase 1: Content Foundation

Move hard-coded project content into a documented JSON schema and versioned HTML template while keeping the public site static. This proves the content model and rendering contract before introducing a database.

### Phase 2: Secure Admin

Add Cloudflare Access, D1 migrations, protected API routes, automated backup, R2 publication snapshots, the server-rendered public route, and a minimal project editor. Support create, edit, draft preview, atomic publish, reorder, and archive; permanent deletion remains disabled.

### Phase 3: Media And History

Add private R2 image uploads, image re-encoding, change history, rollback, and self-service content export. Permanent deletion can be considered only after backup and restore have been tested.

## Expected Effort

A secure single-admin editor with project CRUD, drafts, and publishing is approximately three to seven focused development days after the public site and Cloudflare account are live. Media processing, revision history, and polished rich-text editing add additional scope.

Until this system is implemented, website content should continue to be edited in source files and published through the tested static build.
