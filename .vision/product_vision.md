# Product vision

## The experience

Therapy Deliberate Practice Studio should feel like a focused rehearsal room. The learner sees one meaningful clinical communication problem at a time, understands the skill being practised, responds in their own words, and receives feedback that points to observable strengths and a manageable next improvement. The interface should not turn model choice, recording state, or infrastructure into the centre of the experience.

The application supports English and French interface content. User-facing language must be direct, specific, and translatable. Empty, loading, offline, permission-denied, model-downloading, and failed-evaluation states need purposeful guidance rather than spinners without context or raw technical errors.

## Main product surfaces

The **library** is the entry point for finding published practice tasks. It lets a learner search, filter, inspect difficulty and skill domain, and open a task without losing their place or filter state. A task detail page explains the purpose, criteria, examples, and available practice actions.

The **standard practice page** guides one attempt. It presents the patient context, optionally plays patient audio, makes microphone state unambiguous, preserves a transcript the learner can inspect, and separates transcription from evaluation. Long local model work shows its real phase and an honest waiting message. Errors preserve recoverable input whenever possible. Evaluation presents criterion-level reasoning and a concise next action; it also displays whether the result is `cloud_trusted` or `local_unverified`.

The **minigame hub and game views** provide quicker solo or shared practice while retaining the same recording, transcript, evaluation, trust, and error semantics. Desktop and mobile layouts are equally supported. Locally evaluated scores may drive a private game's immediate feedback, but the interface labels them as unverified and does not mix them into shared or public leaderboards.

The **history, profile, public profile, and leaderboard** surfaces help users review activity and progress. History preserves task and evaluation provenance. Personal progress can include local unverified attempts with clear labeling. Public profiles, leaderboards, and comparative statistics use only eligible trusted data and explain exclusions without shaming the learner.

The **settings page** controls hosted or local artificial-intelligence mode and explains the privacy consequences. Local setup is a guided sequence: install and start the desktop application, copy the masked pairing key, paste it into the browser, test the connection, choose supported defaults, and try a bounded model check. The browser stores the key only for the normalized local gateway origin. A lost or rotated key produces a clear “pair again” path.

The **help area** explains getting started, deliberate-practice concepts, data flow, local model requirements, supported operating systems, model sizes, and troubleshooting. The model list is generated from executable specifications and uses plain platform and memory guidance. It distinguishes integration evidence from full production-model quality evidence.

The **desktop Local Runtime application** is a compact control centre, not a developer console. It shows whether the gateway is stopped, starting, ready, degraded, or blocked; makes start and stop actions safe; exposes the gateway address and masked pairing key; supports reveal, copy, and confirmed regeneration; and explains when a saved setting needs a restart. Model cards show platform compatibility, download requirements, actual readiness, and recovery. The control centre reports the exact configuration, data, and model-cache locations used by the gateway. Logs and diagnostics are metadata-only and never include prompts, transcripts, or model outputs. Diagnostics distinguish configuration, port conflict, dependency, storage, and model failures.

The **administrator surfaces** let authorized curators create, parse, edit, translate, validate, and publish tasks and their criteria and examples. They remain separate from the learner flow and preserve the same task schema used by practice and evaluation.

## Local inference journey

On first launch, the desktop application creates a cryptographically random capability key in its durable configuration and starts the gateway only on loopback. The key is masked by default. The learner explicitly copies it into the web settings page, which stores it in browser storage scoped by normalized gateway origin. The hosted application never receives it.

Connection testing verifies the gateway identity and authorization rather than accepting any HTTP response from the port. The learner can inspect the available model catalog before downloading large files. Starting the gateway must not wait for a default multi-gigabyte model to download. When a requested model is not ready, the interface shows a real model-loading or download state and prevents duplicate concurrent loads.

For local speech, the browser sends the captured audio directly to the loopback gateway. For local evaluation, the authenticated hosted API supplies authorized task context and an evaluation schema, the browser sends that request to the loopback language model, and the hosted API validates and persists the returned structure as `local_unverified`. Derived scores are recomputed on the server. The same principle applies to standard practice and minigames.

Pairing is deliberately simple. There is no QR code, deep link, custom protocol, account sync, or remote relay. Each browser profile is paired separately. If browser storage is cleared, the learner pastes the current key again. If the key may be exposed, the desktop application regenerates it after confirmation, atomically revokes the prior key, and restarts or reauthorizes the gateway.

## Visual and interaction direction

The visual system should feel steady and humane. It uses a restrained neutral background, high-contrast text, a limited accent palette, consistent cards and controls, and spacing that lets the task content breathe. Status is communicated by words and iconography as well as colour. Primary actions are visually obvious; destructive or resetting actions are separated and confirmed.

Motion should explain state changes, not decorate waiting. It respects reduced-motion preferences. Responsive layouts are designed for touch and narrow screens in the same implementation pass as desktop layouts. Long model names, translated strings, logs, and error messages must wrap without breaking the layout.

## Quality definition

The product is ready for a claimed surface only when its normal path, empty state, slow path, error path, recovery path, keyboard path, mobile path, and privacy/trust language have proportionate evidence. Passing compilation alone is not user evidence. A packaged desktop artifact is not supported until its sidecar and resources can be inspected and the packaged gateway can start, authenticate, identify itself, serve its catalog without downloading a model, and stop cleanly on the target operating system.

The product must never claim that an artifact was signed, notarized, published, or accepted by a store based only on configuration or an unexecuted workflow. It must never claim that a local model works based on a placeholder response or a mocked unit test.
