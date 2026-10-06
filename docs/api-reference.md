# Silo Telemetry API — Reference

SiloMon reads Modbus-TCP registers at a site and turns them into a level report. SiloCentral collects
those reports from every site into one view. The first three HTTP endpoints below move the same JSON
document around — out of a site, into a dashboard, or straight into whatever reporting tool you point at
it. `POST /api/heartbeat` carries no data of its own: it tells SiloCentral a site is alive, and its reply
tells the site whether SiloCentral now manages its configuration (see [Remote management](#remote-management)).

| | |
|---|---|
| **SiloMon serves** | `GET /api/report`, `GET /api/pages/{slug}` |
| **SiloCentral serves** | `POST /api/ingest`, `POST /api/heartbeat`, `GET /api/config`, `POST /api/config/import`, `POST /api/config/ack` |
| **Format** | `application/json` |

A Word version of this same reference is at [`api-reference.docx`](./api-reference.docx).

## Auth, at a glance

Two separate keys, two separate directions. Neither is a shared master key — losing one exposes exactly
one site.

| Key | Header | Notes |
|---|---|---|
| **Reporting key** | `Authorization: Bearer <REPORTING_API_KEY>` | Protects requests coming *into* a SiloMon site. Set on that site's own Setup page. Guards `GET /api/report`. |
| **Central API key** | `Authorization: Bearer <site's key>` | Issued per-site by SiloCentral, pasted into that site's Setup page. Sent *out* by the worker. Guards `POST /api/ingest`, `POST /api/heartbeat` and the three `/api/config` endpoints. |
| **No key** | — unauthenticated — | `GET /api/pages/{slug}` has none — internal to the dashboard's own live-update polling. See the note on that endpoint before relying on it. |

## SiloMon — per-site API

Runs on every SiloMon instance — Railway or a Raspberry Pi — and answers for that one site only.

### `GET /api/report`

**Auth:** Bearer token required (`REPORTING_API_KEY`)

Returns this site's current silo levels and status as JSON — every page, every silo, right now. Built
for external reporting tools (a script, a BI pull, a spreadsheet macro) that want this site's data
without waiting on a SiloCentral push.

Returns `503` until `REPORTING_API_KEY` is set on the site — the endpoint is off by default rather than
open by default, since it's the one route meant to be reachable from outside the local network.

**Request**

```bash
# from anywhere with network access to the site
curl https://yard.example.com/api/report \
  -H "Authorization: Bearer $REPORTING_API_KEY"
```

**Response — 200**

```json
{
  "site": "Riverside Yard",
  "generatedAt": "2026-09-03T02:14:07.000Z",
  "pages": [
    {
      "name": "Yard A",
      "slug": "yard-a",
      "silos": [
        {
          "name": "Silo 1",
          "status": "ok",
          "percent": 61.5,
          "currentValue": 49.2,
          "capacity": 80,
          "unit": "t",
          "lastReadAt": "2026-09-03T02:13:58.000Z"
        }
      ]
    }
  ]
}
```

**Status codes**

| Code | Meaning |
|---|---|
| `200` | Report body — shape documented under [The report shape](#the-report-shape) below. |
| `401` | Missing or wrong bearer token. |
| `503` | `REPORTING_API_KEY` isn't set on this site — the endpoint is disabled, not just unauthenticated. |

### `GET /api/pages/{slug}`

**Auth:** none — internal to the dashboard

Status for one dashboard page's silos, polled by the dashboard itself every 15 seconds so a card can
turn red — and sound an alert — the moment a silo crosses into critical, without a page reload.

Not meant for outside integration: no auth, and the shape is free to change alongside the dashboard UI.
Reach for [`GET /api/report`](#get-apireport) instead for anything external — it's the one with a
stability contract.

**Request**

```bash
curl https://yard.example.com/api/pages/yard-a
```

**Response — 200**

```json
{
  "silos": [
    {
      "id": 1,
      "name": "Silo 1",
      "status": "ok",
      "percent": 61.5,
      "currentValue": 49.2,
      "capacity": 80,
      "unit": "t",
      "lastReadAt": "2026-09-03T02:13:58.000Z"
    }
  ]
}
```

**Status codes**

| Code | Meaning |
|---|---|
| `200` | Silo array for that page, each with its own `id` (page-scoped, not global). |
| `404` | No page with that slug on this site. |

## SiloCentral — aggregation API

One dashboard, many sites. Each site's worker pushes here on a timer; nothing pulls.

### `POST /api/ingest`

**Auth:** Bearer token required (per-site key)

Accepts one site's report and stores it as that site's current snapshot — the next call simply
overwrites the last one. Each silo's percentage is also appended to a trend history, which is what
SiloCentral's trend charts draw from.

The bearer token doubles as the site identifier: whichever site owns the key is the site that gets
updated. There's no separate site ID in the request body.

**Request**

```bash
curl -X POST https://central.example.com/api/ingest \
  -H "Authorization: Bearer $CENTRAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "site": "Riverside Yard",
    "generatedAt": "2026-09-03T02:14:07.000Z",
    "pages": [{
      "name": "Yard A",
      "slug": "yard-a",
      "silos": [{
        "name": "Silo 1",
        "status": "ok",
        "percent": 61.5,
        "currentValue": 49.2,
        "capacity": 80,
        "unit": "t",
        "lastReadAt": "2026-09-03T02:13:58.000Z"
      }]
    }]
  }'
```

**Response — 200**

```json
{ "ok": true }
```

**Response — 400**

```json
{
  "error": "Invalid report payload",
  "issues": [ "… zod validation detail …" ]
}
```

**Status codes**

| Code | Meaning |
|---|---|
| `200` | `{ "ok": true }` — snapshot stored, `lastReportAt` updated for that site. |
| `400` | Body doesn't match the report shape below — see `issues` for exactly which field. |
| `401` | Missing bearer token, or it doesn't match any registered site's key. |

### `POST /api/heartbeat`

**Auth:** Bearer token required (per-site key — the same one as `POST /api/ingest`)

A lightweight "I'm alive" ping. Each site's worker sends one about every 30 seconds so SiloCentral can
show whether the site is **online**. It has no request body — the bearer token identifies the site — and
it changes nothing but that site's last-heartbeat time. In particular it does not touch the stored report
or add trend history, so a site that is alive but has stale data can't make that data look fresh.

SiloCentral stamps the heartbeat with its own clock, not the site's, so a Pi with a drifting clock can't
appear online or offline by sending the wrong time.

A site's "last seen" time is whichever is newer, its last heartbeat or its last report, and it is shown
as **offline** after 2 minutes without either. Sites still running an older SiloMon that sends only
reports stay correct, because their reports arrive often enough to stay inside that window.

**Request**

```bash
curl -X POST https://central.example.com/api/heartbeat \
  -H "Authorization: Bearer $CENTRAL_API_KEY"
```

**Response — 200**

```json
{ "ok": true, "managed": false, "configVersion": 0, "wantsImport": false }
```

| Field | Meaning |
|---|---|
| `ok` | The heartbeat was recorded. |
| `managed` | `true` once an admin has taken over this site's configuration in SiloCentral. |
| `configVersion` | The current configuration version (0 if none stored). While managed, the site applies it when it is newer than the one it last applied. |
| `wantsImport` | `true` when SiloCentral has no configuration for this site yet (or an admin asked for a re-import) and the site should send its own with `POST /api/config/import`. |

Older sites that only look at `ok` keep working; the extra fields are ignored.

**Status codes**

| Code | Meaning |
|---|---|
| `200` | The site's last-heartbeat time was updated; body as above. |
| `401` | Missing bearer token, or it doesn't match any registered site's key. |

## Remote management

An admin can take over a site's pages and silos in SiloCentral and then add, edit and delete them there —
every silo field, including the Modbus host, port, unit and register. Nothing is pushed to the Pi: the
site **pulls**, so it only ever makes outbound requests.

1. The site's heartbeat reply says `wantsImport: true`, and the worker sends its current configuration to
   `POST /api/config/import`. This is a copy; the site stays in control until an admin takes over.
2. An admin clicks **Take over** on the site's settings page. From then on `managed` is `true` and the
   site's own Setup page becomes read-only.
3. Each change an admin saves bumps `configVersion`. The worker sees the new number in a heartbeat reply,
   fetches `GET /api/config`, validates it, applies it in one database transaction, and reports the result
   with `POST /api/config/ack`. If applying fails it retries after 5 minutes and SiloCentral shows the
   error.
4. **Release** hands control back; clearing the central URL or key on the site also releases it.

Pages and silos carry a stable `uid`, so a rename is a rename and not a delete plus an add. Alarm levels
are percentages from 0 to 100 on the wire. Both ends validate the same schema, so an invalid configuration
cannot be saved or applied.

### `GET /api/config`

**Auth:** Bearer token required (per-site key). Returns the managed configuration:
`{ "version": 11, "pages": [ ... ], "silos": [ ... ] }`. `404` if the site is not managed.

### `POST /api/config/import`

**Auth:** Bearer token required. Body: the site's configuration (`pages`, `silos`). Accepted only when
SiloCentral has no configuration for the site or an admin requested a re-import and the site is not
managed. Responds `{ "ok": true, "version": N }`; `400` for an invalid document, `409` if an import was
not requested.

### `POST /api/config/ack`

**Auth:** Bearer token required. Body: `{ "version": 11, "ok": true }` or
`{ "version": 11, "ok": false, "error": "why it failed" }`. Responds `{ "ok": true }`; `400` for an
unknown version.

## The report shape

Every endpoint above hands you this same document, or a piece of it. One site, its pages, and every
silo on each page.

### Top level

| Field | Type | Notes |
|---|---|---|
| `site` | `string` | This site's display name (`SITE_NAME`, defaults to `"SiloMon"`). |
| `generatedAt` | `string` | ISO 8601 timestamp — when this report was built, not when a silo was last read. |
| `pages[]` | `array` | One entry per dashboard page, in display order. |
| `pages[].name` | `string` | Page display name. |
| `pages[].slug` | `string` | URL slug — matches the site's `/{slug}` dashboard route. |
| `pages[].silos[]` | `array` | Every silo on that page. |

### Each silo

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | Silo display name. |
| `status` | `enum` | One of the five values below. |
| `percent` | `number` | Fill level, 0–100, as a percent of capacity. |
| `currentValue` | `number \| null` | Last reading in the silo's own unit. `null` if never successfully read. |
| `capacity` | `number` | Full capacity, same unit as `currentValue`. |
| `unit` | `string` | e.g. `"t"`. |
| `lastReadAt` | `string \| null` | ISO 8601 timestamp of the last successful Modbus read. |

### Status enum

| Value | Meaning |
|---|---|
| `critical` | At or below the silo's critical floor. Triggers the red card and sound alert. |
| `low` | At or below the low-alarm threshold, above critical. |
| `ok` | Within the normal range — no threshold crossed. |
| `high` | At or above the high threshold. Reads as good news, not a warning — plenty of product on hand — so it shares its color with `ok` on the dashboard. |
| `offline` | No successful read in over 2 minutes. Overrides every other status — a stale reading is never reported as if it were current. |

---

Reflects the API as deployed. SiloMon exposes the first two endpoints; SiloCentral exposes the third —
see each project's own Setup page for the keys that go with your own sites.
