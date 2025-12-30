# Therapy Deliberate Practice Studio

Production-grade monorepo for a psychotherapy deliberate-practice platform.

## Structure

```
/apps
  /web
  /api
  /worker
/packages
  /shared
/services
  /local-stt
  /local-llm
/infra
```

## Local development

### Prereqs

- Node 20
- Docker (optional)

### Run locally

```
cp .env.example .env
npm install
npm run build -w apps/web
npm run dev:worker
```

### Run with Docker Compose

```
docker compose -f infra/docker-compose.yml up
```

## Cloudflare Worker (full-stack)

The full-stack Worker lives in `apps/worker`. It serves the built Vite assets from `apps/web/dist`
and routes API traffic under `/api/v1/*` to the Hono app.

### D1 setup & migrations

Create the D1 database (one-time) and update `apps/worker/wrangler.jsonc` with the returned
`database_id`:

```
npx wrangler d1 create deliberate_practice
```

Apply migrations locally and remotely:

```
npx wrangler d1 execute deliberate_practice --file=infra/migrations/0001_init.sql --local
npx wrangler d1 execute deliberate_practice --file=infra/migrations/0001_init.sql --remote
```

Optional: seed demo exercise data:

```
npx wrangler d1 execute deliberate_practice --file=infra/seeds/0001_demo_exercises.sql --local
npx wrangler d1 execute deliberate_practice --file=infra/seeds/0001_demo_exercises.sql --remote
```

### Worker dev & deploy

```
npm run build -w apps/web
npm run dev:worker
```

Deploy:

```
npm run deploy:worker
```

## Configuration

- `AI_MODE` = local_prefer | openai_only | local_only
- `OPENAI_API_KEY`
- `LOCAL_STT_URL`
- `LOCAL_LLM_URL`
- `LOCAL_LLM_MODEL`
