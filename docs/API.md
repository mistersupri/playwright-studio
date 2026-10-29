# ScriptBench API

Use the API to start runs from CI, n8n, cron or any other system, and to read their results.

## Authentication

Create a token in **Settings → API tokens**. The token is shown once; store it as a secret.

```
Authorization: Bearer sbt_<id>_<secret>
```

A token acts as the user who created it: it can do anything that user can do in the app. Revoke it from the same page; the change applies immediately. The server keeps only a SHA-256 hash of the secret part and records when each token was last used.

All paths below are under `/api`. Errors return JSON with a `message`, for example `{ "statusCode": 404, "message": "Project not found." }`.

## Endpoints

### `GET /api/v1/projects`

Projects you own.

```json
[{ "id": "l84evb7zh0vj", "name": "Price tracker", "updatedAt": "2026-10-29T05:12:21.183Z" }]
```

The project id is also in the app's address bar: `/?project=<id>`.

### `POST /api/v1/projects/:id/runs`

Starts a run of the project's **last saved version** (unsaved edits in someone's editor are not included). It uses the project's saved browser session if that is turned on.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `entryFile` | string | first file | File to run |
| `variableSetId` | string | Default set | Variable set to use on top of Default |
| `env` | object | none | Extra values for `process.env`, for this run only |
| `timeoutSeconds` | number | 300 | Time limit (5–3600, capped by the server's `MAX_RUN_SECONDS`) |
| `wait` | boolean | false | Wait for the run to finish (up to 10 minutes) |

Without `wait`:

```json
{ "runId": "bq4ac2v0rurk10", "status": "running" }
```

With `wait: true` the response is the same as `GET /api/v1/runs/:id` once the run ends. If the run is still going after 10 minutes, it returns with `"status": "running"`; poll the run endpoint after that.

If the server is already running its maximum number of runs, the run is queued and starts when a slot is free.

### `GET /api/v1/runs/:id`

```json
{
  "runId": "bq4ac2v0rurk10",
  "status": "success",
  "error": null,
  "projectId": "l84evb7zh0vj",
  "entryFile": "main.js",
  "startedAt": "2026-10-29T05:13:26.672Z",
  "finishedAt": "2026-10-29T05:13:27.581Z",
  "logs": [{ "source": "script", "level": "log", "message": "hello", "at": "2026-10-29T05:13:27.100Z" }],
  "artifacts": [{ "id": "xyz8vlrq1e5myx1f", "name": "shot.png", "kind": "screenshot", "size": 5700, "url": "/api/artifacts/xyz8vlrq1e5myx1f/file" }]
}
```

`status` is one of `queued`, `running`, `success`, `failed` or `stopped`. Log lines have `source` (`script`, `browser` for the page's own console, or `system` for the runner) and `level` (`log`, `info`, `success`, `warning`, `error`).

### `GET /api/v1/runs/:id/artifacts`

Just the files, same shape as `artifacts` above. Download one with the same token:

```bash
curl -H "Authorization: Bearer $SCRIPTBENCH_TOKEN" -o shot.png "$SCRIPTBENCH_URL/api/artifacts/xyz8vlrq1e5myx1f/file?download=1"
```

## Examples

### curl

```bash
curl -X POST "$SCRIPTBENCH_URL/api/v1/projects/$PROJECT_ID/runs" \
  -H "Authorization: Bearer $SCRIPTBENCH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"wait": true, "env": {"ORDER_ID": "1042"}}'
```

### GitHub Actions

Fails the job when the run does not pass.

```yaml
name: Smoke test
on:
  deployment_status:
jobs:
  scriptbench:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - name: Run ScriptBench project
        env:
          SCRIPTBENCH_URL: ${{ vars.SCRIPTBENCH_URL }}
          SCRIPTBENCH_TOKEN: ${{ secrets.SCRIPTBENCH_TOKEN }}
          PROJECT_ID: ${{ vars.SCRIPTBENCH_PROJECT_ID }}
        run: |
          result=$(curl -sf -X POST "$SCRIPTBENCH_URL/api/v1/projects/$PROJECT_ID/runs" \
            -H "Authorization: Bearer $SCRIPTBENCH_TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"wait\": true, \"env\": {\"BASE_URL\": \"${{ github.event.deployment_status.environment_url }}\"}}")
          echo "$result" | jq -r '.logs[] | "[\(.source)] \(.message)"'
          test "$(echo "$result" | jq -r .status)" = "success"
```

## Webhook notifications

A **Webhook** channel (Settings → Notifications) receives a JSON `POST` when a schedule that uses it finishes:

```json
{
  "event": "run.finished",
  "text": "Failed: Price tracker (main.js)\nDuration 4.2 s, 1 file\nError: Timeout 30000ms exceeded.",
  "run": { "id": "fnuu4oz3fn4kdh", "status": "failed", "error": "Timeout 30000ms exceeded.", "startedAt": "…", "finishedAt": "…", "artifacts": 1 },
  "project": { "id": "zjhzry0dhc15", "name": "Price tracker", "entryFile": "main.js" },
  "schedule": { "id": "mazh2iqr4qgj" }
}
```

The **Send test** button posts `{ "event": "test", "text": "…" }`. A delivery counts as failed if the endpoint does not answer with a 2xx status within 10 seconds; failures are added to that run's log.
