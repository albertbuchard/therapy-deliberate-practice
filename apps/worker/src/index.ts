import { createApiApp, type ApiBindings } from "@deliberate/api";

export type WorkerEnv = ApiBindings & {
  ASSETS: Fetcher;
};

const api = createApiApp();

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return api.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  }
};
