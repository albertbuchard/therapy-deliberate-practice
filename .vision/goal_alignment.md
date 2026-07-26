# Goal alignment

## Executive summary

Therapy Deliberate Practice Studio helps psychotherapy trainees and clinicians rehearse specific communication skills, receive structured feedback, and observe their progress over time. It is a training product, not a diagnostic tool and not a replacement for supervision. The central product promise is that a learner can move from choosing a skill to completing a realistic spoken response and understanding the feedback without having to understand the application's technical architecture.

The product has two supported artificial-intelligence paths. Cloud mode uses a server-side provider. Local mode uses a separately installed desktop application and a loopback gateway on the learner's own computer. Local speech and language-model content must travel directly between the browser and that local gateway; the hosted Cloudflare Worker cannot reach a user's `127.0.0.1`. Cloud services may prepare authenticated task context and persist a learner's locally produced result, but locally produced evaluations are visibly marked as unverified and must not be represented as equivalent to trusted server-produced comparisons.

## People and outcomes

The primary user is a psychotherapy trainee or clinician who wants focused practice with a concrete skill such as reflection, validation, or handling a difficult interaction. A successful session lets this learner understand the prompt, record or enter a response, receive criterion-level feedback, and decide what to try next. The product should reduce technical distraction and preserve the learner's confidence when recording, model loading, connectivity, or evaluation takes time.

Educators and administrators curate tasks, examples, criteria, difficulty, and translations. They need predictable editing and publishing behavior, but administrative convenience must not weaken the privacy and evidence boundaries of the learner experience.

The Local Runtime Suite serves users who prefer or require on-device inference. Its desktop application must make installation, gateway status, pairing, model selection, downloads, diagnostics, and recovery understandable without terminal commands. “Local” means that speech and prompt content sent to a local model does not pass through a hosted inference provider. Account, task, and permitted result metadata can still use the hosted application, and the interface must state this distinction accurately.

## Core concepts

A **task** is a deliberate-practice skill exercise with a title, description, skill domain, difficulty, criteria, and one or more patient examples. A **criterion** is an observable part of the response that the evaluator scores and explains. An **example** supplies the patient statement or interaction context for a task and difficulty.

A **practice session** is an ordered set of task examples undertaken by one authenticated user. An **attempt** is the user's recorded or entered response to one example, together with its transcript, criterion-level evaluation, overall result, model provenance, and trust provenance.

A **minigame session** is a faster individual or group practice format built on the same tasks and evaluation semantics. Scores can support personal reflection, game flow, and private progression, but shared rankings must distinguish trusted cloud evaluation from unverified local evaluation.

A **model catalog entry** is an executable contract, not advertising copy. It identifies a model, supported platform and backend, endpoint, hardware expectations, download size, and availability. The catalog must not list a backend that only returns a placeholder or cannot be exercised through the packaged runtime.

An **evaluation trust provenance** states how an evaluation was produced. `cloud_trusted` means the authenticated server controlled the provider request and validation path. `local_unverified` means the learner's browser supplied the output of a local model. The latter can guide that learner's own practice but must be labeled and excluded from public or cross-user comparative statistics.

## Binding product priorities

1. The ordinary practice path must be calm, legible, responsive on desktop and mobile, and explicit about recording, transcription, evaluation, progress, errors, and recovery.
2. Local inference must work through a browser-to-loopback connection protected by a per-install capability key. Pairing must be an explicit, recoverable copy-and-paste flow; the key must never be sent to the hosted API, placed in a URL, logged, or included in analytics.
3. Therapy-related prompts, transcripts, and model outputs are sensitive content. Logs must contain metadata by default and content only after explicit diagnostic opt-in.
4. A model or operating system is supported only when the repository has proportionate executable evidence for its integration and packaging path. Unsupported claims must be removed or clearly marked.
5. Release builds and release publication are separate capabilities. Normal validation produces downloadable build artifacts without creating a public release. Signing, notarization, store submission, tags, deployment, and publication require explicit authorization and configured credentials.
6. Accessibility, keyboard operation, touch targets, visible focus, reduced motion, readable contrast, meaningful status text, and error recovery are part of correctness.
7. Server-derived totals, authenticated task identity, schema validation, and trust provenance are authoritative. Client-supplied aggregate scores are not.

## Current and canonical stack

The repository source and lockfile use Node.js 24 LTS and npm 11. The web client resolves React 19.2.8, React Router 7.18.1, TypeScript 6.0.3, Vite 8.1.5, Redux Toolkit 2.12, Zod 4.4.3, PixiJS 8.19, Tailwind CSS 3, Supabase 2.110.8, Vitest 4.1.10, and Playwright. The API core resolves Hono 4.12.32, Drizzle ORM 0.45.2, and Zod 4.4.3, and runs in a Cloudflare Worker with D1 and R2; Node and SQLite adapters support local development. The local gateway uses the pinned Python 3.12.13 standalone runtime, FastAPI, Uvicorn, Pydantic 2, PyTorch 2.13 and Transformers 5.14.1, MLX on Apple silicon, Faster Whisper 1.2.1, and Parakeet MLX 0.5.2. Windows and Linux packages use the official CPU-only PyTorch wheel; Intel macOS omits PyTorch and the Qwen language adapter because no compatible wheel exists. The desktop launcher is version 0.1.5 and uses Tauri 2, stable Rust 2021, React 19.2.8, Vite 8.1.5, and the packaged Python sidecar. GitHub Actions provides continuous integration and explicitly dispatched native operating-system builds.

The hosted production deployment may continue to run the previous artifact until a separately authorized deployment. The versions above describe the current repository worktree and next build, not an assertion that an unperformed deployment has occurred. Python 3.12.13 is the packaged gateway baseline and its four upstream archives are pinned by URL and SHA-256 digest. The complete packaged runtime is not treated as cross-platform verified until all four native target builds and the bounded backend-family smoke matrix pass with that pinned runtime.

### Binding stack decisions

These decisions distinguish an intentional bounded migration from stale dependencies:

- **React:** React 19.2.8 is installed. Changed rendering and effect timing, stricter development behavior, and third-party peer compatibility remain acceptance concerns until the web and desktop builds, unit tests, and focused browser/desktop smoke tests pass.
- **React Router:** React Router 7.18.1 is installed and removes the reachable advisories in the previous 6.30.2 line. One High advisory, GHSA-qwww-vcr4-c8h2, remains in the package's opt-in React Server Components action path; this static Vite single-page application imports only `react-router-dom` declarative/data-browser APIs and has no React Server Components server, framework plugin, server actions, or `react-router`/`@react-router/*` imports. The repository's production-audit script enforces that call-path boundary, allows only that exact advisory, and expires the exception on 2026-10-01. The project maintainer owns removal as soon as a patched release is published or before expiry. Route navigation, authentication guards, redirects, search state, and direct URL loading require focused checks.
- **Vite:** Vite 8.1.5 and the compatible React plugin are installed on Node 24 LTS. Build output, development proxying, worker bundling, environment variables, and Tauri frontend loading remain binding acceptance checks.
- **TypeScript:** TypeScript 6.0.3 is installed because it is the newest release supported by the current TypeScript-aware lint toolchain. TypeScript 7 is not adopted while that ecosystem declares it unsupported. Every workspace must type-check without broad error suppression or weakened strictness.
- **Vitest:** Vitest 4.1.10 is installed and paired with Vite 8. Existing tests must retain their intended environments, setup files, mocks, and discovery patterns, and the focused suites must actually execute rather than only compile.
- **Zod:** Zod 4.4.3 is installed, and the former `zod-to-json-schema` adapter has been removed in favor of Zod's native JSON Schema support. API request/response, evaluator-schema, model-catalog, settings, and generated-schema regression tests are binding acceptance evidence.

Hono 4.12.32 and Drizzle ORM 0.45.2 are installed. Hono authentication, authorization middleware, repeated-slash/encoded-path routing, cross-origin behavior, error handling, and Worker/Node adapter tests must pass. Drizzle query construction, migrations, attempt persistence, leaderboard filtering, and both D1 and SQLite adapter tests must pass.

The manifest and lockfile resolve the patched transitive versions `ws` 8.21.1 and `@xmldom/xmldom` 0.8.13. PixiJS 8.19 declares the patched XML range; root overrides keep both resolutions deterministic until every direct parent does so. WebSocket-dependent Supabase connection tests and XML-dependent generated/build paths are the compatibility checks for those overrides. Moving XML parsing to 0.9 remains a separate major-compatibility decision and is not required to remove the audited vulnerability.

The enforced `npm run audit:production` gate must report no unresolved reachable High or Critical issue before a finished commit. The only current exception is the exact React Router advisory and unreachable call path recorded above. An exception is otherwise permitted only when call-path evidence proves the vulnerable code unreachable in both production adapters and this file records an owner, exact removal condition, and date; a general “transitive dependency” statement is not an exception.

### Desktop release boundary

The active desktop targets are Apple-silicon macOS, Intel macOS, Windows x64, and Linux x64. Intel macOS is speech-only in the packaged catalog. The build-only workflow creates packages, runs a packaged-gateway smoke against the package that is uploaded, and records checksums and provenance without receiving signing credentials, write permissions, or the authority to modify a GitHub Release. Cryptographic package attestations belong only to the separately authorized signed-build path. macOS App Store and iOS configuration has been retired because the desktop sidecar architecture has no viable mobile runtime path.

The separate release workflow can create only a draft release from an existing version tag and a successful matching `desktop-signed-build` run. The signed build accepts only its workflow execution tag and keeps credentials out of arbitrary-ref build jobs. It references `desktop-signing`, while draft creation references `desktop-release`, but those names do not establish protection. Repository administrators must independently configure and verify required reviewers, no-bypass behavior, version-tag restrictions, and environment-scoped credentials before either workflow is release-ready. Draft creation checks trusted GitHub run metadata, package checksums, packaged-runtime smoke and native-inference evidence, and cryptographic package attestations. It also requires signed and notarized macOS artifacts, signed Windows artifacts, and explicit `PUBLISH` confirmation. Missing environment controls or signing credentials are release-readiness blockers, not permission to weaken the checks.

## Architectural boundaries

The browser owns presentation, microphone capture, explicit local pairing, and direct calls to the loopback gateway. The hosted API owns authentication, task and criterion data, authorization, preparation of evaluation context, validation of returned structures, server-derived aggregates, persistence, and trust labeling. Hosted providers run only in the hosted API. Local providers run only in the local gateway.

The desktop launcher owns the gateway process, a single atomic configuration file, the pairing key, model defaults, log access, and diagnostics. The gateway must read that exact configuration for both server startup and application lifespan. A health response must identify the Therapy Local Runtime rather than treating any listener on the port as healthy.

The model registry owns per-model lifecycle synchronization and returns real readiness and failure states. Large model downloads are explicit or background operations; they cannot block basic gateway health. Packaged sidecars are deterministic target-specific artifacts with pinned upstream inputs, verified checksums, target-suffixed executable names, and package-level smoke evidence.

These boundaries are binding until this vision is deliberately updated.
