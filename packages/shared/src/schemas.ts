import { z } from "zod";

const idSchema = z.string().min(1);

export const objectiveSchema = z.object({
  id: idSchema,
  label: z.string(),
  description: z.string(),
  examples_good: z.array(z.string()).optional(),
  examples_bad: z.array(z.string()).optional(),
  weight: z.number().optional(),
  rubric: z.object({
    score_min: z.literal(0),
    score_max: z.literal(4),
    anchors: z.array(
      z.object({
        score: z.union([
          z.literal(0),
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4)
        ]),
        meaning: z.string()
      })
    )
  })
});

export const gradingSpecSchema = z.object({
  pass_rule: z.object({
    overall_min_score: z.number().optional(),
    min_per_objective: z.number().optional(),
    required_objective_ids: z.array(z.string()).optional()
  }),
  scoring: z.object({
    aggregation: z.literal("weighted_mean")
  })
});

export const exerciseSchema = z.object({
  id: idSchema,
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  skill_domain: z.string(),
  difficulty: z.number().min(1).max(5),
  patient_profile: z.record(z.unknown()),
  example_prompt: z.string(),
  example_good_response: z.string().nullable().optional(),
  objectives: z.array(objectiveSchema).min(2).max(6),
  grading: gradingSpecSchema,
  tags: z.array(z.string()),
  is_published: z.boolean(),
  content: z
    .object({
      preparations: z.array(z.string()).optional(),
      expected_therapist_response: z.string().optional(),
      criteria: z.array(
        z.object({
          id: idSchema,
          label: z.string(),
          description: z.string(),
          objective_id: z.string().optional()
        })
      ),
      roleplay_sets: z.array(
        z.object({
          id: idSchema,
          label: z.string(),
          statements: z.array(
            z.object({
              id: idSchema,
              difficulty: z.enum(["beginner", "intermediate", "advanced"]),
              text: z.string(),
              criterion_ids: z.array(z.string()).optional(),
              cue_ids: z.array(z.string()).optional()
            })
          )
        })
      ),
      example_dialogues: z.array(
        z.object({
          id: idSchema,
          label: z.string(),
          turns: z.array(
            z.object({
              role: z.enum(["client", "therapist"]),
              text: z.string()
            })
          ),
          related_statement_id: z.string().optional()
        })
      ),
      patient_cues: z.array(
        z.object({
          id: idSchema,
          label: z.string(),
          text: z.string(),
          related_statement_ids: z.array(z.string()).optional()
        })
      ),
      practice_instructions: z.string().optional(),
      source: z
        .object({
          text: z.string().nullable().optional(),
          url: z.string().nullable().optional()
        })
        .optional()
    })
    .optional(),
  criteria: z
    .array(
      z.object({
        id: idSchema,
        label: z.string(),
        description: z.string(),
        objective_id: z.string().optional()
      })
    )
    .optional()
});

export const deliberatePracticeTaskV2Schema = z.object({
  version: z.literal("2.0"),
  task: z.object({
    name: z.string(),
    description: z.string(),
    skill_domain: z.string(),
    skill_difficulty_label: z.string().optional(),
    skill_difficulty_numeric: z.number().min(1).max(5),
    objectives: z.array(
      z.object({
        id: idSchema,
        label: z.string(),
        description: z.string()
      })
    ),
    tags: z.array(z.string())
  }),
  content: z.object({
    preparations: z.array(z.string()).optional(),
    expected_therapist_response: z.string().optional(),
    criteria: z.array(
      z.object({
        id: idSchema,
        label: z.string(),
        description: z.string(),
        objective_id: z.string().optional()
      })
    ),
    roleplay_sets: z.array(
      z.object({
        id: idSchema,
        label: z.string(),
        statements: z.array(
          z.object({
            id: idSchema,
            difficulty: z.enum(["beginner", "intermediate", "advanced"]),
            text: z.string(),
            criterion_ids: z.array(z.string()).optional(),
            cue_ids: z.array(z.string()).optional()
          })
        )
      })
    ),
    example_dialogues: z.array(
      z.object({
        id: idSchema,
        label: z.string(),
        turns: z.array(
          z.object({
            role: z.enum(["client", "therapist"]),
            text: z.string()
          })
        ),
        related_statement_id: z.string().optional()
      })
    ),
    patient_cues: z.array(
      z.object({
        id: idSchema,
        label: z.string(),
        text: z.string(),
        related_statement_ids: z.array(z.string()).optional()
      })
    ),
    practice_instructions: z.string().optional(),
    source: z
      .object({
        text: z.string().nullable().optional(),
        url: z.string().nullable().optional()
      })
      .optional()
  })
});

export const llmParseSchema = z.object({
  version: z.literal("2.0"),
  task: z.object({
    name: z.string(),
    short_name: z.string(),
    skill_domain: z.string(),
    skill_difficulty_label: z.enum(["beginner", "intermediate", "advanced"]).nullable(),
    skill_difficulty_numeric: z.number().min(1).max(5),
    description: z.string(),
    objective_overview: z.string(),
    preparations: z.array(z.string()),
    source: z.object({
      citation_text: z.string().nullable(),
      source_url: z.string().nullable()
    }),
    expected_therapist_response: z.object({
      must_do: z.array(z.string()),
      should_do: z.array(z.string()),
      must_avoid: z.array(z.string()),
      style_constraints: z.array(z.string())
    }),
    criteria: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        behavioral_markers: z.array(z.string()),
        common_mistakes: z.array(z.string()),
        what_counts_as_evidence: z.array(z.string()),
        weight: z.number().nullable()
      })
    ),
    objectives: z.array(
      z.object({
        id: z.string(),
        criterion_ids: z.array(z.string()),
        label: z.string(),
        description: z.string(),
        rubric: z.object({
          score_min: z.literal(0),
          score_max: z.literal(4),
          anchors: z.array(
            z.object({
              score: z.union([
                z.literal(0),
                z.literal(1),
                z.literal(2),
                z.literal(3),
                z.literal(4)
              ]),
              meaning: z.string()
            })
          )
        })
      })
    ),
    practice_instructions: z.object({
      timebox_minutes: z.number().nullable(),
      steps: z.array(z.string()),
      feedback_process: z.array(z.string()),
      difficulty_adjustment_rule: z.string().nullable(),
      role_switching: z.string().nullable()
    }),
    roleplay_sets: z.array(
      z.object({
        difficulty_label: z.enum(["beginner", "intermediate", "advanced"]),
        difficulty_numeric: z.number().min(1).max(5),
        client_statements: z.array(
          z.object({
            id: z.string(),
            title: z.string().nullable(),
            affect_tag: z.string().nullable(),
            text: z.string(),
            primary_themes: z.array(z.string()),
            linked_criterion_ids: z.array(z.string()),
            extracted_cue_ids: z.array(z.string())
          })
        )
      })
    ),
    example_dialogues: z.array(
      z.object({
        id: z.string(),
        difficulty_label: z.enum(["beginner", "intermediate", "advanced"]).nullable(),
        client_turn: z.string(),
        therapist_turn: z.string(),
        criterion_callouts: z.array(
          z.object({
            criterion_id: z.string(),
            evidence_in_therapist_turn: z.string()
          })
        )
      })
    ),
    patient_cues: z.array(
      z.object({
        id: z.string(),
        difficulty: z.number().min(1).max(5),
        label: z.string(),
        evidence_quote: z.string(),
        why_it_matters: z.string(),
        therapist_response_hint: z.string(),
        difficulty_reason: z.string(),
        applies_to_statement_ids: z.array(z.string())
      })
    ),
    tags: z.array(z.string())
  })
});

export type LlmParseResult = z.infer<typeof llmParseSchema>;

export const evaluationResultSchema = z.object({
  version: z.literal("1.0"),
  exercise_id: z.string(),
  attempt_id: z.string(),
  transcript: z.object({
    text: z.string(),
    confidence: z.number().optional(),
    words: z
      .array(
        z.object({
          w: z.string(),
          t0: z.number().optional(),
          t1: z.number().optional(),
          p: z.number().optional()
        })
      )
      .optional()
  }),
  objective_scores: z.array(
    z.object({
      objective_id: z.string(),
      score: z.number().min(0).max(4),
      rationale_short: z.string().max(240),
      evidence_quotes: z.array(z.string()).optional(),
      missed_points: z.array(z.string()).optional()
    })
  ),
  overall: z.object({
    score: z.number().min(0).max(4),
    pass: z.boolean(),
    summary_feedback: z.string().max(400),
    what_to_improve_next: z.array(z.string()).min(1).max(3)
  }),
  patient_reaction: z.object({
    emotion: z.enum([
      "neutral",
      "warm",
      "sad",
      "anxious",
      "angry",
      "relieved",
      "engaged"
    ]),
    intensity: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3)
    ]),
    action: z
      .enum(["nod", "shake_head", "look_away", "lean_in", "sigh", "smile"])
      .optional(),
    response_text: z.string().optional()
  }),
  diagnostics: z
    .object({
      provider: z.object({
        stt: z.object({
          kind: z.enum(["local", "openai"]),
          model: z.string().optional()
        }),
        llm: z.object({
          kind: z.enum(["local", "openai"]),
          model: z.string().optional()
        })
      }),
      timing_ms: z
        .object({
          stt: z.number().optional(),
          llm: z.number().optional(),
          total: z.number().optional()
        })
        .optional()
    })
    .optional()
});

export const practiceRunInputSchema = z.object({
  exercise_id: z.string(),
  attempt_id: z.string().optional(),
  audio: z.string(),
  mode: z.enum(["local_prefer", "openai_only", "local_only"]).optional()
});

export const practiceRunResponseSchema = z.object({
  requestId: z.string(),
  attemptId: z.string().optional(),
  transcript: z
    .object({
      text: z.string(),
      provider: z.object({
        kind: z.enum(["local", "openai"]),
        model: z.string()
      }),
      duration_ms: z.number()
    })
    .optional(),
  scoring: z
    .object({
      evaluation: evaluationResultSchema,
      provider: z.object({
        kind: z.enum(["local", "openai"]),
        model: z.string()
      }),
      duration_ms: z.number()
    })
    .optional(),
  errors: z
    .array(
      z.object({
        stage: z.enum(["input", "stt", "scoring", "db"]),
        message: z.string()
      })
    )
    .optional(),
  debug: z
    .object({
      timings: z.record(z.number()),
      selectedProviders: z.object({
        stt: z.object({
          kind: z.enum(["local", "openai"]),
          model: z.string()
        }),
        llm: z
          .object({
            kind: z.enum(["local", "openai"]),
            model: z.string()
          })
          .nullable()
      })
    })
    .optional()
});
