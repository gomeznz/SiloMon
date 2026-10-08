# SiloCentral API Reference

Everything SiloCentral serves over HTTP, in one place. There are three kinds of caller, each with its own
credential, and each endpoint belongs to exactly one of them.

| Audience | Credential | Endpoints | Section |
|---|---|---|---|
| **Customers** and their systems, reading data | Customer key, `Authorization: Bearer sck_...` | `GET /api/v1/sites`, `GET /api/v1/levels`, `GET /api/v1/history` | [Reporting API](#reporting-api-for-customers) |
| **SiloMon sites**, sending data and receiving configuration | Site key, `Authorization: Bearer <site key>` | `POST /api/ingest`, `POST /api/heartbeat`, `GET /api/config`, `POST /api/config/import`, `POST /api/config/ack` | [Site API](#site-api-for-silomon-nodes) |
| **People signed in to the dashboard** | Session cookie | `GET /api/export/levels`, `GET /api/export/history/{slug}` | [Dashboard downloads](#dashboard-downloads) |

A machine-readable description of the first two groups is in [`silocentral-openapi.yaml`](./silocentral-openapi.yaml)
(OpenAPI 3.0). It can be loaded into Postman, Swagger UI or a code generator.

| | |
|---|---|
| **Base URL** | `https://<your-silocentral-address>` |
| **Format** | JSON requests and responses, unless a CSV is asked for |
| **Timestamps** | ISO 8601, in UTC (`2026-10-08T03:25:00.000Z`) |
| **Errors** | `{ "error": "message" }` with an HTTP status; see each endpoint |

## Credentials

| Credential | Who gets it | How it is made | Notes |
|---|---|---|---|
| **Customer key** (`sck_...`) | An outside party | An admin adds a customer under **Setup, Customers & API** and ticks the sites they may read. | Shown once, stored only as a hash. Can be replaced (the old one stops at once) or deleted. Read-only. |
| **Site key** | One SiloMon site | Made when an admin adds the site under **Setup**, and shown on its edit page. | Pasted into that site's own Setup page, in the Central dashboard card, together with SiloCentral's address. Identifies the site; it can only act as that site. |
| **Session cookie** | A person | Signing in at `/login`. | For browsers. Not meant for programs. |

The three are not interchangeable: a site key is refused by the reporting API, and a customer key is refused
by the site API.

---

# Reporting API (for customers)

Read-only access to silo levels, current and historic. Everything is `GET`, nothing you send can change
anything, and a key can read only the sites it was issued for.

| | |
|---|---|
| **Auth** | `Authorization: Bearer <customer key>` |
| **Rate limit** | 120 requests per minute per key; over that, `429` with a `Retry-After` header (seconds) |
| **CSV** | `?format=csv` on `/levels` and `/history` |

```bash
export KEY="sck_..."
export BASE="https://<your-silocentral-address>/api/v1"

curl "$BASE/sites"  -H "Authorization: Bearer $KEY"
curl "$BASE/levels" -H "Authorization: Bearer $KEY"
curl "$BASE/history?site=riverside&from=2026-09-01&to=2026-09-14&interval=1h" -H "Authorization: Bearer $KEY"
```

A site that does not exist and a site the key may not read both answer `404`, so the API cannot be used to find
out which sites other customers have.

## `GET /api/v1/sites`

The sites the key can read, and whether each is online.

```json
{
  "generatedAt": "2026-10-08T03:30:00.000Z",
  "sites": [
    { "slug": "riverside", "name": "Riverside Yard", "online": true, "lastSeenAt": "2026-10-08T03:29:41.000Z" }
  ]
}
```

| Field | Notes |
|---|---|
| `slug` | The site's short identifier; use it as the `site` parameter elsewhere. |
| `online` | `true` if the site has been in contact within the last 2 minutes. |
| `lastSeenAt` | When the site last made contact, or `null` if it never has. |

## `GET /api/v1/levels`

The most recent reading of every silo on the sites the key can read. Sites report about once a minute, so
there is no benefit in calling this more often.

| Parameter | Notes |
|---|---|
| `site` | Optional. A site `slug`, for just that site. |
| `format` | `json` (default) or `csv`. |

```json
{
  "generatedAt": "2026-10-08T03:30:00.000Z",
  "sites": [
    {
      "slug": "riverside",
      "name": "Riverside Yard",
      "online": true,
      "lastSeenAt": "2026-10-08T03:29:41.000Z",
      "reportedAt": "2026-10-08T03:29:38.000Z",
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
              "feedWeightTonnes": 20,
              "feedStoredTonnes": 12.3,
              "lastReadAt": "2026-10-08T03:29:30.000Z"
            }
          ]
        }
      ]
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `reportedAt` | string or null | On each site: when it built the report these levels come from. |
| `percent` | number | How full the silo is, 0-100. |
| `currentValue` | number or null | The raw reading in the silo's own `unit`. `null` if never read. |
| `capacity` | number | The full reading, in the same `unit` as `currentValue`. |
| `feedWeightTonnes` | number or null | The manufacturer's stated weight of feed when the silo is full, in tonnes. `null` if not set. |
| `feedStoredTonnes` | number or null | Tonnes of feed in the silo now: `percent` (limited to 0-100) of `feedWeightTonnes`. `null` if there is no feed weight. |
| `lastReadAt` | string or null | When the silo's sensor was last read successfully. |
| `status` | string | `ok`, `low`, `critical`, `high` or `offline`; see below. |

**`status`**: `critical` and `low` mean the level is at or below the silo's alarm thresholds, and `high` that
it is at or above its high threshold. `offline` means the silo's **sensor** has not answered for over 2
minutes. That is not the same as the **site** being offline: when a site is offline (`online: false`), its
silos show the last values it reported, so check `online` before trusting them as live.

## `GET /api/v1/history`

Past fill levels, grouped by site and silo.

| Parameter | Default | Notes |
|---|---|---|
| `from` | 24 hours before `to` | Start of the range, inclusive. |
| `to` | now | End of the range. |
| `interval` | `1h` | `raw`, `5m`, `15m`, `1h` or `1d`. |
| `site` | all your sites | A site `slug`. |
| `page` | all pages | A page `slug`, as returned by `/levels`. |
| `silo` | all silos | A silo name, matched exactly. |
| `format` | `json` | `json` or `csv`. |

**Dates.** `from` and `to` accept a date or a full date-time:

- `2026-09-14` is the whole of that day in UTC. As a `to`, it includes the 14th.
- `2026-09-14T08:30:00Z` or `2026-09-14T20:30:00+12:00` is that exact moment. As a `to`, readings before it are
  included. A date-time with no zone is read as UTC.

**Intervals.** The readings inside each interval are averaged into one point, and `t` is the start of that
interval. `raw` returns every stored reading (about one a minute). An interval with no readings has no point,
so gaps in the data appear as gaps in the list.

**Limits.** A range can be at most 366 days. One response can hold at most 50,000 data points; a request that
would return more gets `422` with `"code": "too_many_rows"` and no data. Ask for a shorter range, a coarser
interval, or one site or silo at a time. A year of `1h` data for one silo is about 8,800 points.

```json
{
  "generatedAt": "2026-10-08T03:30:00.000Z",
  "from": "2026-10-07T03:30:00.000Z",
  "to": "2026-10-08T03:30:00.000Z",
  "interval": "1h",
  "sites": [
    {
      "slug": "riverside",
      "name": "Riverside Yard",
      "silos": [
        {
          "page": "yard-a",
          "name": "Silo 1",
          "unit": "t",
          "feedWeightTonnes": 20,
          "points": [
            { "t": "2026-10-07T04:00:00.000Z", "percent": 61.5, "feedStoredTonnes": 12.3 },
            { "t": "2026-10-07T05:00:00.000Z", "percent": 60.8, "feedStoredTonnes": 12.16 }
          ]
        }
      ]
    }
  ]
}
```

History records the fill **percentage**. `feedStoredTonnes` in each point is worked out from the silo's
**current** `feedWeightTonnes`, so if that weight was changed during the period, older points use the new value.
It is `null` for silos with no feed weight.

## CSV format

Add `format=csv` to `/levels` or `/history`. The response is UTF-8, `Content-Type: text/csv`, with a header
row, CRLF line endings and blank cells for missing values.

`/levels`:

```
site,site_online,site_last_seen_at,page,silo,status,percent,current_value,capacity,unit,feed_weight_tonnes,feed_stored_tonnes,last_read_at
```

`/history`:

```
site,page,silo,timestamp,percent,feed_stored_tonnes
```

Site, page and silo names that begin with `=`, `+`, `-` or `@` are written with a leading apostrophe so a
spreadsheet cannot run them as a formula. If you parse the file with software, strip a single leading `'` from
those text columns.

## Reporting API errors

| Status | Meaning |
|---|---|
| `400` | A parameter is invalid; the message says which and how. |
| `401` | Missing or unrecognised key. The response carries `WWW-Authenticate: Bearer`. |
| `404` | No such site (or not one this key may read). |
| `422` | The request would return more than 50,000 data points (`"code": "too_many_rows"`). |
| `429` | Rate limit exceeded; wait `Retry-After` seconds. |

**Good practice.** Poll `/levels` no more than once a minute. For history, ask only for the time since your last
call (`from` = the last `t` you stored) rather than the whole range each time. Store timestamps as UTC. Treat
unknown fields in a response as additions, not errors: fields may be added to `/api/v1` without notice, and none
will be renamed or removed without a new version path.

---

# Site API (for SiloMon nodes)

These are called by each SiloMon site's worker, not by people. A site only ever makes outbound requests to
SiloCentral; SiloCentral never connects to a site. It talks back through the reply to the heartbeat.

| | |
|---|---|
| **Auth** | `Authorization: Bearer <site key>` on every call |
| **Failure** | `401 { "error": "Unauthorized" }` if the key is missing or matches no site |

## `POST /api/ingest`

A site sends its current silo report. SiloCentral keeps it as the site's latest report and adds one point to each
silo's trend history.

**Request body**

```json
{
  "site": "Riverside Yard",
  "generatedAt": "2026-10-08T03:29:38.000Z",
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
          "feedWeightTonnes": 20,
          "feedStoredTonnes": 12.3,
          "lastReadAt": "2026-10-08T03:29:30.000Z"
        }
      ]
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `site` | string | The site's own name for itself. SiloCentral shows the name set on its site record, not this. |
| `generatedAt` | string | When the report was built (ISO 8601). |
| `pages[].name`, `pages[].slug` | string | A dashboard page on the site. |
| `pages[].silos[].name` | string | Silo name. Trend history is kept against page slug plus silo name, so renaming a silo starts a new history. |
| `status` | enum | `ok`, `low`, `critical`, `high` or `offline`. |
| `percent` | number | Fill level, 0-100. Stored (to 2 decimals) as the trend point. |
| `currentValue` | number or null | Last reading in the silo's own unit. |
| `capacity` | number | Full reading, in the same unit. |
| `unit` | string | e.g. `"t"`. |
| `feedWeightTonnes`, `feedStoredTonnes` | number or null | Optional. Sent by SiloMon versions that support feed weight; older ones omit them. |
| `lastReadAt` | string or null | Last successful sensor read. |

| Status | Meaning |
|---|---|
| `200` | `{ "ok": true }`. The latest report and the site's last-report time were updated, and one trend reading per silo was added. |
| `400` | The body does not match the shape above: `{ "error": "Invalid report payload", "issues": [...] }`, where `issues` lists exactly which fields. |
| `401` | Bad site key. |

A site pushes a report about once a minute. Fields not listed above are ignored.

## `POST /api/heartbeat`

A lightweight "I am alive" ping, sent about every 30 seconds. It has no request body. SiloCentral records
it with its own clock, not the site's, so a Pi with a drifting clock cannot look online or offline by sending
the wrong time. A heartbeat updates only the last-contact time: it does not touch the stored report or add trend
history, so a site that is alive but has stale data cannot make that data look fresh.

A site's "last seen" time is whichever is newer, its last heartbeat or its last report. It shows as **offline**
after 2 minutes without either.

**Response, 200**

```json
{ "ok": true, "managed": false, "configVersion": 0, "wantsImport": true }
```

| Field | Meaning |
|---|---|
| `ok` | The heartbeat was recorded. |
| `managed` | `true` once an admin has taken over this site's configuration in SiloCentral. |
| `configVersion` | The current configuration version (`0` if SiloCentral holds none). While managed, the site applies it when it is newer than the one it last applied. |
| `wantsImport` | `true` when SiloCentral has no configuration for the site (or an admin asked for a fresh copy, and the site is not managed). The site should then call `POST /api/config/import`. |

A SiloMon version that predates remote management reads only `ok` and ignores the rest.

## Remote management

An admin can take over a site's pages and silos in SiloCentral and then add, edit and delete them, including every
silo's Modbus host, port, unit, register, data type, scaling, capacity, feed weight and alarm levels. Nothing is
pushed to the Pi: the site **pulls**.

1. The heartbeat reply says `wantsImport: true`, and the site sends its current configuration to `POST /api/config/import`.
   This is a copy; the site stays in control.
2. An admin clicks **Take over management** on the site's Settings page. From then on `managed` is `true` and the
   site's own Setup page is read-only.
3. Each change an admin saves raises `configVersion`. The site sees the new number in a heartbeat reply, fetches
   `GET /api/config`, validates it, applies it in one database transaction, and reports the result with
   `POST /api/config/ack`. If applying fails, it retries after 5 minutes and SiloCentral shows the error.
4. **Release management** hands control back; clearing the central URL or key on the site also releases it.

Pages and silos carry a stable `uid`, so a rename is a rename and not a delete plus an add. Alarm levels are
percentages 0-100 on the wire. Both ends validate the same rules, so an invalid configuration can be neither
saved nor applied.

### The configuration document

Used by `GET /api/config` (with a `version` added) and `POST /api/config/import`.

```json
{
  "pages": [
    {
      "uid": "5b1e1c9a-0f3a-4c5e-9c1d-2f8d6c1a7b10",
      "name": "Yard A",
      "slug": "yard-a",
      "sortOrder": 0
    }
  ],
  "silos": [
    {
      "uid": "9d3e7a42-6a31-4d0e-8d3b-0c7a5f2e9b11",
      "pageUid": "5b1e1c9a-0f3a-4c5e-9c1d-2f8d6c1a7b10",
      "name": "Silo 1",
      "sortOrder": 0,
      "host": "192.168.1.50",
      "port": 502,
      "unitId": 1,
      "registerAddress": 230,
      "dataType": "UINT16",
      "scale": 1,
      "invertLevel": false,
      "capacity": 80,
      "unit": "t",
      "feedWeightTonnes": 20,
      "lowAlarmPercent": 20,
      "highAlarmPercent": 90,
      "criticalPercent": 10,
      "isActive": true
    }
  ]
}
```

| Field | Rules |
|---|---|
| `pages[].uid`, `silos[].uid`, `silos[].pageUid` | Opaque stable ids: 8-64 characters, letters, digits and dashes. Unique within the document. `pageUid` must match a page. |
| `pages[].name` | 1-100 characters. |
| `pages[].slug` | Lowercase letters, digits and single dashes. Unique. |
| `sortOrder` | Integer, 0-100000. |
| `silos[].name` | 1-100 characters. |
| `host` | Modbus gateway host or IP. Letters, digits, `.`, `_`, `:` and `-` only; up to 253 characters. |
| `port` | 1-65535. |
| `unitId` | 0-255. |
| `registerAddress` | The protocol (0-based) register address, 0-65535. Not a 4xxxx Modicon number: subtract 40001 (40231 is 230). |
| `dataType` | `UINT16`, `INT16`, `UINT32`, `INT32` or `FLOAT32`. |
| `scale` | Multiplier applied to the raw reading. Non-zero, below 1,000,000 in size. |
| `invertLevel` | `true` for sensors that report empty space instead of product depth. |
| `capacity` | Above zero and below 10,000,000,000. In the same unit as the scaled reading. |
| `unit` | 1-20 characters. |
| `feedWeightTonnes` | Optional. Above zero, at most 1,000,000, or `null`. Missing is read as `null`. |
| `lowAlarmPercent`, `highAlarmPercent`, `criticalPercent` | 0-100, or `null` when not set. |
| `isActive` | `false` stops the site polling that silo without deleting it. |
| Whole document | At most 100 pages and 500 silos. |

## `GET /api/config`

The managed configuration. Returns the document above plus its `version`:
`{ "version": 11, "pages": [...], "silos": [...] }`.

| Status | Meaning |
|---|---|
| `200` | The configuration. |
| `404` | `{ "error": "This site is not managed by SiloCentral" }`: no admin has taken the site over. |
| `401` | Bad site key. |

## `POST /api/config/import`

The site sends its current configuration (the document above, without `version`). Accepted only when SiloCentral
holds none for the site yet, or an admin asked for a fresh copy and the site is not managed. A managed site
cannot overwrite configuration an admin has changed.

| Status | Meaning |
|---|---|
| `200` | `{ "ok": true, "version": 1 }`. Stored; what was sent is recorded as already applied. |
| `400` | `{ "error": "Invalid configuration", "detail": "..." }`: the document breaks one of the rules above. |
| `409` | `{ "error": "A configuration import wasn't requested" }`: not wanted now (check the heartbeat's `wantsImport`). |
| `401` | Bad site key. |

## `POST /api/config/ack`

The site reports whether it applied a version.

```json
{ "version": 11, "ok": true }
```

```json
{ "version": 11, "ok": false, "error": "Port must be between 1 and 65535" }
```

| Field | Rules |
|---|---|
| `version` | Integer above zero, no higher than the current version. |
| `ok` | `true` if applied. |
| `error` | Optional text, up to 1,000 characters; shown to the admin when `ok` is `false`. |

| Status | Meaning |
|---|---|
| `200` | `{ "ok": true }`. |
| `400` | Not a valid acknowledgement, or a version SiloCentral has not issued. |
| `401` | Bad site key. |

---

# Dashboard downloads

The **Download CSV** buttons in the dashboard use these. They are authenticated by the signed-in session cookie, so a
program cannot use them; programs should use the reporting API above. Without a session they answer `401`
(or redirect to the login page when opened in a browser).

## `GET /api/export/levels`

The current level of every silo on every site, as CSV with the same columns as `/api/v1/levels?format=csv`. It
begins with a byte order mark so Excel reads it as UTF-8.

## `GET /api/export/history/{slug}`

Level history for one site's silos, as CSV with the same columns as `/api/v1/history?format=csv` (also with a byte
order mark). It covers the same window the site's trend chart is showing and is bucketed the same way. It takes
the chart's own parameters:

| Parameter | Notes |
|---|---|
| `range` | A preset: `3h`, `12h`, `24h`, `7d`, `30d` or `1y`. Default `3h`. |
| `from`, `to` | A custom range as plain dates (`2026-09-01`). When both are valid they win over `range`. |
| `tz` | The viewer's IANA time zone (e.g. `Pacific/Auckland`), so a date means midnight there rather than in UTC. |

`404` if the site does not exist; `422` if the range would hold more than 50,000 points.
