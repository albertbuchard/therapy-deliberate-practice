# Product requirements

## Purpose and scope

Therapy Deliberate Practice Studio must support deliberate-practice task discovery, spoken or typed attempts, structured evaluation, progress review, minigames, administration, and an optional on-device inference path. This document defines product-level behavior and evidence expectations. It does not authorize deployments, releases, tags, signing operations, or store submissions.

## Functional requirements

### Practice and evaluation

Authenticated learners must be able to open a published task, understand its criteria and example, record or enter a response, inspect the transcript, request evaluation, and review criterion-level feedback. Recording, upload, transcription, evaluation, and persistence are separate visible states. Retrying a failed later phase must not needlessly discard successful earlier work.

The server must validate task, example, session, and user relationships before persisting an attempt. It must validate evaluator output against the expected schema and compute overall totals from accepted criterion values. The persisted attempt must record the provider/model and either `cloud_trusted` or `local_unverified` trust provenance.

Personal history and adaptive practice may use a learner's local unverified results when they are visibly labeled. Public leaderboards, cross-user rankings, trusted comparative statistics, and claims about evaluator equivalence must exclude local unverified and ambiguously classified legacy results.

### Local Runtime Suite

The desktop application must start and stop exactly one managed gateway, distinguish it from a foreign listener on the same port, and use one atomic durable configuration for port, storage, cache, model defaults, logging policy, and capability key. Saving a setting that requires restart must remain visibly pending until the gateway restarts with it.

The gateway must bind to loopback by default and require a bearer capability for model catalog, logs, diagnostics containing sensitive metadata, and inference endpoints. It must enforce an explicit Origin and Host policy suitable for the packaged Tauri application and approved web origins. Health must expose a stable product identity and readiness semantics without leaking the capability or therapy content.

The desktop application must show a masked capability key with explicit reveal and copy actions. Confirmed regeneration must atomically replace the key and invalidate the previous key. The web application must store the key only under browser storage scoped by normalized gateway origin and must never transmit it to the hosted API, query strings, application logs, telemetry, or error reporting.

The browser, rather than the hosted Worker, must call the local gateway for local speech and language inference. The hosted API may prepare authenticated evaluation context and receive validated local output, but it must mark that output unverified. Standard practice and minigames must follow the same data-flow and trust contract.

### Models

Every generated model-catalog entry must correspond to a real implementation with accurate model identity, immutable default model revision, backend, supported platforms, memory guidance, approximate download size, and endpoint. Faster Whisper must run the real Faster Whisper library. Transformer language generation must use a causal language-model class and a compatible checkpoint. Apple-silicon MLX entries must use compatible MLX checkpoints and libraries.

Model lifecycle operations must be synchronized per model so concurrent requests do not create duplicate large loads. Basic gateway health and catalog access must not wait for default model downloads. Logs must exclude prompts, transcripts, and outputs by default; an explicit local diagnostic setting may enable content logging with a clear warning.

### Web and desktop usability

The web settings and help surfaces must provide a complete local setup path, platform requirements, model size and compatibility guidance, pairing recovery, and actionable failures. The desktop application must communicate gateway state, restart-required settings, model readiness, storage location, and diagnostic results in plain language.

All changed user-facing flows must support keyboard navigation, visible focus, screen-reader names, high-contrast status beyond colour, reduced motion, touch targets, narrow mobile layout, long translated text, and recoverable slow/error states.

### Packaging and release engineering

Portable Python sidecars must use pinned upstream runtime artifacts and verified checksums. Target selection must be exact; archives must be extracted safely; cached payloads must be invalidated by all source and dependency inputs that affect the bundle; and executables must use Tauri's required target suffix.

The build matrix must cover only declared native targets and must name macOS Apple-silicon and Intel runners explicitly. Each package must be inspected or installed in a safe runner context, checked for the target sidecar and resources, and exercised by starting the packaged gateway without model downloads, authorizing health/catalog access, and stopping it.

Normal continuous integration and build-only workflows must use read-only repository permissions and upload artifacts without creating or editing a GitHub Release. Any future publication workflow must be separately dispatched and granted write permission only at its publication job. Its named GitHub environments are not considered protected until repository settings provide independently verified required reviewers, no-bypass behavior, version-tag restrictions, and environment-scoped credentials. Signing and notarization claims require secret preflight and executed evidence. Placeholder identities are prohibited.

App Store and iOS configuration must either have an executable supported build-only path with accurate constraints or be retired from active documentation and workflow claims. A desktop sidecar architecture must not be presented as iOS-compatible without a separate viable mobile runtime design.

## Non-functional requirements

Sensitive therapy content must be minimized in transit and storage, redacted from ordinary logs, and protected by authenticated and origin-aware boundaries. The local capability is a secret. The product is an educational tool and must not imply clinical diagnosis or guaranteed patient outcomes.

The web application must remain responsive throughout recording and inference. Long operations need honest phase/status information and cancellation or safe retry where the underlying operation permits it. Concurrent model requests must not multiply memory use unexpectedly.

The production JavaScript build baseline is Node.js 24 LTS. The application targets supported evergreen browsers and a baseline compatible with the current Vite generation. The desktop application targets declared native Windows, macOS Apple-silicon, macOS Intel, and Linux packages only when target-level evidence exists. Intel macOS may expose Faster Whisper but must not expose the Qwen Transformers model while PyTorch 2.13 lacks a compatible Python 3.12 wheel. The portable builder requests the pinned Python 3.12.13 runtime. That baseline becomes a verified claim only after pinned-runtime builds and the native dependency/backend smoke matrix pass on every declared target.

Generated catalogs, schemas, lockfiles, versions, checksums, and package metadata must be reproducible and checked in continuous integration. Public documentation must describe the actual implemented and tested behavior.

## Acceptance evidence

The minimum evidence set is:

- JavaScript type checks, lint, unit tests, and production builds for affected workspaces;
- focused browser tests for cloud and local standard practice, local minigames, pairing, unauthorized access, trust labeling, leaderboard exclusion, slow states, failure recovery, mobile layout, and keyboard operation;
- Python Ruff, unit/API/security tests, registry concurrency tests, configuration tests, and real library-path integration smokes using bounded compatible fixtures;
- Rust formatting, clippy/check, unit tests for configuration and lifecycle behavior, and desktop interface tests;
- deterministic catalog generation and diff checks;
- sidecar-builder tests covering exact target selection, checksum rejection, archive traversal rejection, cache invalidation, and executable naming;
- workflow syntax/action checks, least-privilege inspection, native target builds, package inspection, and packaged gateway startup/authentication/shutdown smokes;
- structured six-pass code review and independent checkpoint review with no unresolved Critical or High finding.

Small fixture models prove backend integration, not full production-checkpoint output quality. If supported-hardware or native-runner evidence is unavailable, the corresponding support claim and score must remain limited rather than being inferred.

## Stopping rules

Validation is finite and mapped to changed risk. A material feature is complete when its stated normal, negative, privacy, recovery, accessibility, and regression checks pass and independent review finds no Critical or High defect. Failed external signing, runner, browser-policy, upstream-asset, or model-hardware prerequisites are reported as blockers; they are not bypassed and do not become unsupported success claims.
