import type { Page } from "@playwright/test";
import {
  expect,
  expectNoSeriousAccessibilityViolations,
  fulfillJson,
  test,
} from "./fixtures";

const task = {
  id: "task-routed",
  slug: "routed-reflection",
  title: "Reflecting concern",
  description: "Practise reflecting a difficult concern.",
  skill_domain: "reflection",
  base_difficulty: 2,
  general_objective: "Reflect and invite exploration.",
  tags: ["empathy"],
  language: "en",
  is_published: true,
  parent_task_id: null,
  created_at: 1,
  updated_at: 1,
  criteria: [
    {
      id: "criterion-routed",
      task_id: "task-routed",
      label: "Reflect",
      description: "Reflect the patient’s concern.",
      rubric: null,
      sort_order: 0,
    },
  ],
  interaction_examples: [],
};

const installLearnerRoutes = async (page: Page) => {
  await page.route("**/api/v1/tasks/languages", (route) =>
    fulfillJson(route, { languages: ["en", "fr"] }),
  );
  await page.route("**/api/v1/tasks/tags", (route) =>
    fulfillJson(route, { tags: ["empathy"] }),
  );
  await page.route("**/api/v1/tasks/skill-domains", (route) =>
    fulfillJson(route, { skill_domains: ["reflection"] }),
  );
  await page.route("**/api/v1/tasks?*", (route) => fulfillJson(route, [task]));
  await page.route(`**/api/v1/tasks/${task.id}*`, (route) =>
    fulfillJson(route, task),
  );
  await page.route("**/api/v1/attempts?*", (route) =>
    fulfillJson(route, [
      {
        id: "attempt-routed",
        session_id: "session-routed",
        task_id: task.id,
        task_title: task.title,
        example_difficulty: 2,
        completed_at: "2026-07-28T10:00:00.000Z",
        overall_score: 3.5,
        overall_pass: true,
        score_trust: "local_unverified",
      },
    ]),
  );
  await page.route("**/api/v1/leaderboard?*", (route) =>
    fulfillJson(route, {
      query: { tags: [], skill_domain: null, language: null, limit: 25 },
      entries: [
        {
          user_id: "user-public",
          display_name: "Alex Learner",
          score: 3.8,
          played: 8,
          last_active_at: 1_753_697_600_000,
        },
      ],
      generated_at: 1_753_697_600_000,
    }),
  );
  await page.route("**/api/v1/profiles/user-public", (route) =>
    fulfillJson(route, {
      profile: {
        id: "user-public",
        display_name: "Alex Learner",
        bio: "Practising reflective listening.",
        created_at: "2026-01-01T00:00:00.000Z",
        stats: {
          average_score: 3.8,
          tasks_played: 8,
          last_active_at: "2026-07-28T10:00:00.000Z",
        },
      },
    }),
  );
};

const expectNoHorizontalOverflow = async (page: Page) => {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
};

test.describe("requirements-mapped learner routes", () => {
  test("protected routes retain a safe internal return destination", async ({
    browser,
    baseURL,
  }) => {
    const unauthenticatedPage = await browser.newPage();
    await unauthenticatedPage.route("**/api/v1/admin/whoami", (route) =>
      fulfillJson(route, {
        isAuthenticated: false,
        isAdmin: false,
        email: null,
      }),
    );

    await unauthenticatedPage.goto(`${baseURL}/history?view=recent`);
    await expect(unauthenticatedPage).toHaveURL(
      /\/login\?returnTo=%2Fhistory%3Fview%3Drecent$/,
    );

    await unauthenticatedPage.goto(
      `${baseURL}/login?returnTo=%2F%2Fevil.example`,
    );
    await expect(unauthenticatedPage).toHaveURL(
      new RegExp(
        `^${(baseURL ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/login`,
      ),
    );
    await unauthenticatedPage.close();
  });

  test("library, detail, and direct draft denial remain routed and keyboard operable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await installLearnerRoutes(page);
    await page.goto("/");

    await expect(page.getByText(task.title)).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
    await page.getByRole("link", { name: "View details" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: task.title })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.route("**/api/v1/tasks/draft-private*", (route) =>
      fulfillJson(route, { error: "Task not found." }, 404),
    );
    await page.goto("/tasks/draft-private");
    await expect(page.getByText("Task not found.")).toBeVisible();
  });

  test("library covers loading, filtering, sorting, history, empty, error, and retry states", async ({
    page,
  }) => {
    await installLearnerRoutes(page);
    let releaseInitialRequest = () => undefined;
    const initialRequestGate = new Promise<void>((resolve) => {
      releaseInitialRequest = resolve;
    });
    let isInitialRequest = true;
    let shouldFail = true;

    await page.route("**/api/v1/tasks?*", async (route) => {
      const url = new URL(route.request().url());
      const query = url.searchParams.get("q");
      if (isInitialRequest) {
        isInitialRequest = false;
        await initialRequestGate;
      }
      if (query === "error" && shouldFail) {
        await fulfillJson(route, { error: "Temporary library failure." }, 503);
        return;
      }
      await fulfillJson(route, query === "empty" ? [] : [task]);
    });

    await page.goto("/");
    await expect(
      page.getByRole("status", { name: "Loading tasks..." }),
    ).toHaveCount(4);
    releaseInitialRequest();
    await expect(page.getByText(task.title)).toBeVisible();

    await page.getByRole("button", { name: "Advanced" }).click();
    await page.getByLabel("Sort").selectOption("oldest");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/sort=oldest/);

    const search = page.getByLabel("Search tasks");
    await search.fill("empty");
    await expect(page.getByText("No tasks match your filters.")).toBeVisible();
    await expect(page).toHaveURL(/q=empty/);

    await page.goto("/?q=error&sort=oldest");
    await expect(page.getByRole("alert")).toContainText(
      "We couldn't load the task library.",
    );
    shouldFail = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText(task.title)).toBeVisible();

    await page.goto("/?q=empty");
    await page.goto("/?q=error");
    await page.goBack();
    await expect(page).toHaveURL(/q=empty/);
    await expect(page.getByText("No tasks match your filters.")).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/q=error/);
    await expect(page.getByText(task.title)).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("history, leaderboard, public profile, settings retention, and no-release Help fit pairwise layouts", async ({
    page,
  }) => {
    await installLearnerRoutes(page);
    await page.route(
      "https://api.github.com/repos/**/releases/latest",
      (route) => fulfillJson(route, { message: "Not Found" }, 404),
    );

    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/history");
    await expect(page.getByText("Local · unverified")).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
    await expectNoHorizontalOverflow(page);

    await page.goto("/leaderboard");
    await expect(page.getByText("Alex Learner")).toBeVisible();
    await page.getByRole("link", { name: "Alex Learner" }).click();
    await expect(
      page.getByRole("heading", { name: "Alex Learner" }),
    ).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/settings");
    await expect(
      page.getByText("Audio recordings are not retained."),
    ).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
    await expect(page.getByText("Store audio recordings")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await page.goto("/help/local-suite");
    await expect(
      page.getByText(/no verified desktop release has been published yet/i),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("language choice is scoped, keyboard reachable, and preserves the current route", async ({
    page,
  }) => {
    await installLearnerRoutes(page);
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto("/tasks/task-routed");
    const language = page
      .getByRole("navigation")
      .getByRole("combobox", { name: /language/i });
    await language.focus();
    await language.selectOption("fr");
    await expect(page).toHaveURL(/\/tasks\/task-routed$/);
    await expect(
      page.getByRole("link", { name: /commencer la pratique/i }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(
      page.getByRole("link", { name: /commencer la pratique/i }),
    ).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("Help removes route animation when reduced motion is requested", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/help");
    const animatedContent = page.locator('[class*="helpFadeSlide"]').first();
    await expect(animatedContent).toBeVisible();
    await expect
      .poll(() =>
        animatedContent.evaluate(
          (element) => window.getComputedStyle(element).animationName,
        ),
      )
      .toBe("none");
  });

  test("profile keeps edits after a failed save and remains accessible", async ({
    page,
  }) => {
    await page.route("**/api/v1/me/profile", async (route) => {
      await fulfillJson(route, { error: "Temporary profile failure." }, 503);
    });
    await page.route("**/api/v1/me", async (route) => {
      if (route.request().method() === "PUT") {
        await fulfillJson(route, { error: "Temporary profile failure." }, 503);
        return;
      }
      await fulfillJson(route, {
        id: "user-1",
        email: "dev@example.com",
        display_name: "Dev User",
        bio: "Initial biography.",
        created_at: "2026-01-01T00:00:00.000Z",
        hasOpenAiKey: false,
      });
    });

    await page.goto("/profile");
    const displayName = page.getByLabel("Display name");
    await displayName.fill("Edited learner");
    await page.getByRole("button", { name: "Save profile" }).click();

    await expect(
      page.getByText("We couldn't save your profile. Try again."),
    ).toBeVisible();
    await expect(displayName).toHaveValue("Edited learner");
    await expectNoSeriousAccessibilityViolations(page);
  });
});
