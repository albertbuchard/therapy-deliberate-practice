import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { createApiApp } from "../src/app";
import { ensureSchema } from "../src/db/init";
import { resolveEnv } from "../src/env";
import {
  attempts,
  minigamePlayers,
  minigameRounds,
  minigameSessions,
  taskCriteria,
  taskExamples,
  tasks,
  userSettings,
  users
} from "../src/db/schema";

const jwtSecret = "local-practice-route-test-secret";

const createAuthHeader = async (userId: string) => {
  const token = await new SignJWT({ email: `${userId}@example.com` })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(jwtSecret));
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
};

const installOpenAiEvaluationMock = (attemptId: string) => {
  const evaluation = {
    version: "2.0",
    task_id: "task-1",
    example_id: "example-1",
    attempt_id: attemptId,
    transcript: { text: "A cloud-evaluated local transcript." },
    criterion_scores: [
      { criterion_id: "c1", score: 4, rationale_short: "Reflects the concern." },
      { criterion_id: "c2", score: 4, rationale_short: "Invites exploration." }
    ],
    overall: {
      score: 4,
      pass: true,
      summary_feedback: "Strong cloud evaluation.",
      what_to_improve_next: ["Keep the invitation concise."]
    },
    patient_reaction: { emotion: "engaged", intensity: 2 }
  };
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: `response-${attemptId}`,
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: JSON.stringify(evaluation) }]
          }
        ]
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "x-request-id": `request-${attemptId}`
        }
      }
    );
};

test("local practice is validated, private in history, and safely committed to a minigame", async () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const tempDirectory = await mkdtemp(path.join(testDirectory, "tmp-local-practice-"));
  const dbPath = path.join(tempDirectory, "test.sqlite");
  ensureSchema(dbPath);
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite);
  try {
    const env = resolveEnv({
      ENV: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      OPENAI_API_KEY: "test-openai-key"
    });
    const app = createApiApp({
      env,
      db,
      tts: {
        storage: {
          headObject: async () => ({ exists: false }),
          putObject: async () => ({}),
          getObject: async () => ({
            body: new Uint8Array(),
            contentType: "audio/mpeg"
          })
        }
      }
    });
    const now = Date.now();
    await db.insert(users).values([
      {
        id: "user-1",
        email: "user-1@example.com",
        display_name: "User One",
        bio: null,
        created_at: now
      },
      {
        id: "user-2",
        email: "user-2@example.com",
        display_name: "User Two",
        bio: null,
        created_at: now
      }
    ]);
    await db.insert(userSettings).values([
      {
        user_id: "user-1",
        ai_mode: "local_only",
        local_base_url: "http://127.0.0.1:8484",
        local_stt_url: null,
        local_llm_url: null,
        store_audio: false,
        openai_key_ciphertext: null,
        openai_key_iv: null,
        openai_key_kid: null,
        updated_at: now,
        created_at: now
      },
      {
        user_id: "user-2",
        ai_mode: "local_only",
        local_base_url: "http://127.0.0.1:8484",
        local_stt_url: null,
        local_llm_url: null,
        store_audio: false,
        openai_key_ciphertext: null,
        openai_key_iv: null,
        openai_key_kid: null,
        updated_at: now,
        created_at: now
      }
    ]);
    await db.insert(tasks).values({
      id: "task-1",
      slug: "local-practice-task",
      title: "Local practice task",
      description: "Test local scoring.",
      skill_domain: "validation",
      base_difficulty: 2,
      general_objective: "Respond with validation.",
      tags: ["test"],
      language: "en",
      is_published: false,
      parent_task_id: null,
      created_at: now,
      updated_at: now
    });
    await db.insert(taskCriteria).values([
      {
        id: "c1",
        task_id: "task-1",
        label: "Reflect",
        description: "Reflect the patient's concern.",
        rubric: null,
        sort_order: 0
      },
      {
        id: "c2",
        task_id: "task-1",
        label: "Explore",
        description: "Invite further exploration.",
        rubric: null,
        sort_order: 1
      }
    ]);
    await db.insert(taskExamples).values({
      id: "example-1",
      task_id: "task-1",
      difficulty: 2,
      severity_label: null,
      patient_text: "I do not know if I can manage this.",
      language: "en",
      meta: null,
      created_at: now,
      updated_at: now
    });

    const userOneHeaders = await createAuthHeader("user-1");
    const removedServerHealth = await app.request("/api/v1/health/local-ai", {
      headers: userOneHeaders
    });
    assert.equal(removedServerHealth.status, 404);
    const publicUrlSettings = await app.request("/api/v1/me/settings", {
      method: "PUT",
      headers: userOneHeaders,
      body: JSON.stringify({
        aiMode: "local_only",
        localAiBaseUrl: "https://example.com",
        localSttUrl: null,
        localLlmUrl: null,
        storeAudio: false
      })
    });
    assert.equal(publicUrlSettings.status, 400);
    const splitOriginSettings = await app.request("/api/v1/me/settings", {
      method: "PUT",
      headers: userOneHeaders,
      body: JSON.stringify({
        aiMode: "local_only",
        localAiBaseUrl: null,
        localSttUrl: "http://127.0.0.1:8484",
        localLlmUrl: "http://127.0.0.1:8585",
        storeAudio: false
      })
    });
    assert.equal(splitOriginSettings.status, 400);
    const unpublishedResponse = await app.request("/api/v1/practice/local/prepare", {
      method: "POST",
      headers: userOneHeaders,
      body: JSON.stringify({ task_id: "task-1", example_id: "example-1" })
    });
    assert.equal(unpublishedResponse.status, 404);

    await db.update(tasks).set({ is_published: true });
    const prepareResponse = await app.request("/api/v1/practice/local/prepare", {
      method: "POST",
      headers: userOneHeaders,
      body: JSON.stringify({ task_id: "task-1", example_id: "example-1" })
    });
    assert.equal(prepareResponse.status, 200);
    const preparation = (await prepareResponse.json()) as {
      attemptId: string;
      score_trust: string;
    };
    assert.equal(preparation.score_trust, "local_unverified");

    const pendingHistory = await app.request("/api/v1/attempts", {
      headers: userOneHeaders
    });
    assert.deepEqual(await pendingHistory.json(), []);

    const transcript = "It sounds overwhelming, and I wonder what feels hardest right now.";
    const buildLocalCommitBody = (attemptId: string) => ({
      attempt_id: attemptId,
      transcript: { text: transcript, model: "local-stt", duration_ms: 120 },
      evaluation: {
        version: "2.0",
        task_id: "task-1",
        example_id: "example-1",
        attempt_id: attemptId,
        transcript: { text: transcript },
        criterion_scores: [
          { criterion_id: "c1", score: 4, rationale_short: "Reflects overwhelm." },
          { criterion_id: "c2", score: 2, rationale_short: "Offers a focused question." }
        ],
        overall: {
          score: 0,
          pass: false,
          summary_feedback: "Tampered client totals must be ignored.",
          what_to_improve_next: ["Use a broader open question."]
        },
        patient_reaction: { emotion: "engaged", intensity: 2 }
      },
      llm: { model: "local-llm", duration_ms: 220 },
      practice_mode: "real_time"
    });

    const cloudPrepareResponse = await app.request("/api/v1/practice/local/prepare", {
      method: "POST",
      headers: userOneHeaders,
      body: JSON.stringify({ task_id: "task-1", example_id: "example-1" })
    });
    assert.equal(cloudPrepareResponse.status, 200);
    const cloudPreparation = (await cloudPrepareResponse.json()) as {
      attemptId: string;
    };
    const standardOriginalFetch = globalThis.fetch;
    try {
      installOpenAiEvaluationMock(cloudPreparation.attemptId);
      const cloudFallbackResponse = await app.request("/api/v1/practice/run", {
        method: "POST",
        headers: userOneHeaders,
        body: JSON.stringify({
          task_id: "task-1",
          example_id: "example-1",
          attempt_id: cloudPreparation.attemptId,
          transcript_text: "A cloud-evaluated local transcript.",
          mode: "openai_only"
        })
      });
      assert.equal(cloudFallbackResponse.status, 200);
      const cloudFallback = (await cloudFallbackResponse.json()) as {
        score_trust: string;
        scoring: { provider: { kind: string } };
      };
      assert.equal(cloudFallback.scoring.provider.kind, "openai");
      assert.equal(cloudFallback.score_trust, "cloud_trusted");
    } finally {
      globalThis.fetch = standardOriginalFetch;
    }
    const [cloudAttempt] = await db
      .select({
        score_trust: attempts.score_trust,
        model_info: attempts.model_info
      })
      .from(attempts)
      .where(eq(attempts.id, cloudPreparation.attemptId));
    assert.equal(cloudAttempt?.score_trust, "cloud_trusted");
    assert.equal(cloudAttempt?.model_info?.score_trust, "cloud_trusted");
    assert.equal(cloudAttempt?.model_info?.provider?.llm?.kind, "openai");

    const commitBody = buildLocalCommitBody(preparation.attemptId);
    const commitResponse = await app.request("/api/v1/practice/local/commit", {
      method: "POST",
      headers: userOneHeaders,
      body: JSON.stringify(commitBody)
    });
    assert.equal(commitResponse.status, 200);
    const committed = (await commitResponse.json()) as {
      scoring: { evaluation: { overall: { score: number; pass: boolean } } };
      score_trust: string;
    };
    assert.equal(committed.scoring.evaluation.overall.score, 3);
    assert.equal(committed.scoring.evaluation.overall.pass, true);
    assert.equal(committed.score_trust, "local_unverified");
    const retryCommitResponse = await app.request("/api/v1/practice/local/commit", {
      method: "POST",
      headers: userOneHeaders,
      body: JSON.stringify(commitBody)
    });
    assert.equal(retryCommitResponse.status, 200);
    const changedTranscript = `${transcript} Changed.`;
    const conflictingCommitResponse = await app.request("/api/v1/practice/local/commit", {
      method: "POST",
      headers: userOneHeaders,
      body: JSON.stringify({
        ...commitBody,
        transcript: { ...commitBody.transcript, text: changedTranscript },
        evaluation: {
          ...commitBody.evaluation,
          transcript: { text: changedTranscript }
        }
      })
    });
    assert.equal(conflictingCommitResponse.status, 409);
    const [beforeRecovery] = await db
      .select({ model_info: attempts.model_info })
      .from(attempts)
      .where(eq(attempts.id, preparation.attemptId));
    const originalFetch = globalThis.fetch;
    let providerFetches = 0;
    globalThis.fetch = async () => {
      providerFetches += 1;
      throw new Error("A completed attempt must not invoke a provider.");
    };
    try {
      const recoveryResponse = await app.request("/api/v1/practice/run", {
        method: "POST",
        headers: userOneHeaders,
        body: JSON.stringify({
          task_id: "task-1",
          example_id: "example-1",
          attempt_id: preparation.attemptId,
          transcript_text: "A different retry body must still return stored truth.",
          mode: "openai_only"
        })
      });
      assert.equal(recoveryResponse.status, 200);
      const recovered = (await recoveryResponse.json()) as {
        scoring: { evaluation: { overall: { score: number } } };
      };
      assert.equal(recovered.scoring.evaluation.overall.score, 3);
      assert.equal(providerFetches, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
    const [afterRecovery] = await db
      .select({ model_info: attempts.model_info })
      .from(attempts)
      .where(eq(attempts.id, preparation.attemptId));
    assert.deepEqual(afterRecovery?.model_info, beforeRecovery?.model_info);

    await db.insert(minigameSessions).values({
      id: "game-1",
      user_id: "user-1",
      game_type: "ffa",
      visibility_mode: "normal",
      task_selection: {},
      settings: {},
      created_at: now,
      ended_at: null,
      last_active_at: now,
      current_round_id: "round-1",
      current_player_id: "player-1",
      deleted_at: null
    });
    await db.insert(minigamePlayers).values([
      {
        id: "player-1",
        session_id: "game-1",
        name: "Player One",
        avatar: "astro",
        team_id: null,
        created_at: now
      },
      {
        id: "unassigned-player",
        session_id: "game-1",
        name: "Unassigned",
        avatar: "astro",
        team_id: null,
        created_at: now
      }
    ]);
    await db.insert(minigameRounds).values({
      id: "round-1",
      session_id: "game-1",
      position: 0,
      task_id: "task-1",
      example_id: "example-1",
      player_a_id: "player-1",
      player_b_id: null,
      team_a_id: null,
      team_b_id: null,
      status: "active",
      started_at: now,
      completed_at: null
    });

    const unassignedResponse = await app.request(
      "/api/v1/minigames/sessions/game-1/rounds/round-1/commit-local",
      {
        method: "POST",
        headers: userOneHeaders,
        body: JSON.stringify({
          player_id: "unassigned-player",
          attempt_id: preparation.attemptId
        })
      }
    );
    assert.equal(unassignedResponse.status, 404);

    const userTwoHeaders = await createAuthHeader("user-2");
    const otherUserResponse = await app.request(
      "/api/v1/minigames/sessions/game-1/rounds/round-1/commit-local",
      {
        method: "POST",
        headers: userTwoHeaders,
        body: JSON.stringify({
          player_id: "player-1",
          attempt_id: preparation.attemptId
        })
      }
    );
    assert.equal(otherUserResponse.status, 404);

    const standardAttemptReuse = await app.request(
      "/api/v1/minigames/sessions/game-1/rounds/round-1/commit-local",
      {
        method: "POST",
        headers: userOneHeaders,
        body: JSON.stringify({
          player_id: "player-1",
          attempt_id: preparation.attemptId
        })
      }
    );
    assert.equal(standardAttemptReuse.status, 409);

    const scopedPrepareResponse = await app.request("/api/v1/practice/local/prepare", {
      method: "POST",
      headers: userOneHeaders,
      body: JSON.stringify({
        task_id: "task-1",
        example_id: "example-1",
        minigame: {
          session_id: "game-1",
          round_id: "round-1",
          player_id: "player-1"
        }
      })
    });
    assert.equal(scopedPrepareResponse.status, 200);
    const scopedPreparation = (await scopedPrepareResponse.json()) as {
      attemptId: string;
    };
    const scopedCommitResponse = await app.request("/api/v1/practice/local/commit", {
      method: "POST",
      headers: userOneHeaders,
      body: JSON.stringify(buildLocalCommitBody(scopedPreparation.attemptId))
    });
    assert.equal(scopedCommitResponse.status, 200);
    await db.insert(minigameRounds).values({
      id: "round-2",
      session_id: "game-1",
      position: 1,
      task_id: "task-1",
      example_id: "example-1",
      player_a_id: "player-1",
      player_b_id: null,
      team_a_id: null,
      team_b_id: null,
      status: "active",
      started_at: now,
      completed_at: null
    });
    const wrongRoundResponse = await app.request(
      "/api/v1/minigames/sessions/game-1/rounds/round-2/commit-local",
      {
        method: "POST",
        headers: userOneHeaders,
        body: JSON.stringify({
          player_id: "player-1",
          attempt_id: scopedPreparation.attemptId
        })
      }
    );
    assert.equal(wrongRoundResponse.status, 409);

    const finalizeRequest = {
      method: "POST",
      headers: userOneHeaders,
      body: JSON.stringify({
        player_id: "player-1",
        attempt_id: scopedPreparation.attemptId
      })
    };
    const [finalizeResponse, concurrentFinalizeResponse] = await Promise.all([
      app.request(
        "/api/v1/minigames/sessions/game-1/rounds/round-1/commit-local",
        finalizeRequest
      ),
      app.request(
        "/api/v1/minigames/sessions/game-1/rounds/round-1/commit-local",
        finalizeRequest
      )
    ]);
    assert.equal(finalizeResponse.status, 200);
    assert.equal(concurrentFinalizeResponse.status, 200);
    const finalized = (await finalizeResponse.json()) as {
      adjusted_score: number;
      score_trust: string;
    };
    assert.equal(finalized.adjusted_score, 3);
    assert.equal(finalized.score_trust, "local_unverified");

    const idempotentResponse = await app.request(
      "/api/v1/minigames/sessions/game-1/rounds/round-1/commit-local",
      finalizeRequest
    );
    assert.equal(idempotentResponse.status, 200);

    const stateResponse = await app.request("/api/v1/minigames/sessions/game-1/state", {
      headers: userOneHeaders
    });
    assert.equal(stateResponse.status, 200);
    const state = (await stateResponse.json()) as {
      results: Array<{ score_trust: string }>;
    };
    assert.equal(state.results.length, 1);
    assert.equal(state.results[0]?.score_trust, "local_unverified");

    await db.insert(minigameRounds).values({
      id: "round-cloud",
      session_id: "game-1",
      position: 2,
      task_id: "task-1",
      example_id: "example-1",
      player_a_id: "player-1",
      player_b_id: null,
      team_a_id: null,
      team_b_id: null,
      status: "active",
      started_at: now,
      completed_at: null
    });
    const cloudMinigamePrepareResponse = await app.request(
      "/api/v1/practice/local/prepare",
      {
        method: "POST",
        headers: userOneHeaders,
        body: JSON.stringify({
          task_id: "task-1",
          example_id: "example-1",
          minigame: {
            session_id: "game-1",
            round_id: "round-cloud",
            player_id: "player-1"
          }
        })
      }
    );
    assert.equal(cloudMinigamePrepareResponse.status, 200);
    const cloudMinigamePreparation =
      (await cloudMinigamePrepareResponse.json()) as { attemptId: string };
    const minigameOriginalFetch = globalThis.fetch;
    try {
      installOpenAiEvaluationMock(cloudMinigamePreparation.attemptId);
      const cloudMinigameFallbackResponse = await app.request(
        "/api/v1/minigames/sessions/game-1/rounds/round-cloud/submit",
        {
          method: "POST",
          headers: userOneHeaders,
          body: JSON.stringify({
            player_id: "player-1",
            attempt_id: cloudMinigamePreparation.attemptId,
            transcript_text: "A cloud-evaluated local transcript.",
            mode: "openai_only",
            practice_mode: "real_time"
          })
        }
      );
      assert.equal(cloudMinigameFallbackResponse.status, 200);
      const cloudMinigameFallback =
        (await cloudMinigameFallbackResponse.json()) as {
          score_trust: string;
          scoring: { provider: { kind: string } };
        };
      assert.equal(cloudMinigameFallback.scoring.provider.kind, "openai");
      assert.equal(cloudMinigameFallback.score_trust, "cloud_trusted");
    } finally {
      globalThis.fetch = minigameOriginalFetch;
    }
    const [cloudMinigameAttempt] = await db
      .select({
        score_trust: attempts.score_trust,
        model_info: attempts.model_info
      })
      .from(attempts)
      .where(eq(attempts.id, cloudMinigamePreparation.attemptId));
    assert.equal(cloudMinigameAttempt?.score_trust, "cloud_trusted");
    assert.equal(
      cloudMinigameAttempt?.model_info?.score_trust,
      "cloud_trusted"
    );
    assert.equal(
      cloudMinigameAttempt?.model_info?.provider?.llm?.kind,
      "openai"
    );
  } finally {
    sqlite.close();
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
