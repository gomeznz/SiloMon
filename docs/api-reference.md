# Silo Telemetry API — Reference

SiloMon reads Modbus-TCP registers at a site and turns them into a level report. SiloCentral collects
those reports from every site into one view. All three HTTP endpoints below move the same JSON document
around — out of a site, into a dashboard, or straight into whatever reporting tool you point at it.

| | |
|---|---|
| **SiloMon serves** | `GET /api/report`, `GET /api/pages/{slug}` |
| **SiloCentral serves** | `POST /api/ingest` |
| **Format** | `application/json` |

A Word version of this same reference is at [`api-reference.docx`](./api-reference.docx).

## Auth, at a glance

Two separate keys, two separate directions. Neither is a shared master key — losing one exposes exactly
one site.

| Key | Header | Notes |
|---|---|---|
| **Reporting key** | `Authorization: Bearer <REPORTING_API_KEY>` | Protects requests coming *into* a SiloMon site. Set on that site's own Setup page. Guards `GET /api/report`. |
| **Central API key** | `Authorization: Bearer <site's key>` | Issued per-site by SiloCentral, pasted into that site's Setup page. Sent *out* by the worker. Guards `POST /api/ingest`. |
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
overwrites the last one. SiloCentral keeps no history of its own; each site's own dashboard already
does that for its own data.

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
