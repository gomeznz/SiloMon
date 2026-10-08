# SiloCentral Reporting API

Read-only access to silo levels, current and historic, over HTTPS. It is for another system to pull
data on a schedule. Everything is `GET`, nothing you send can change anything, and a key can read only the
sites it was issued for.

| | |
|---|---|
| **Base URL** | `https://<your-silocentral-address>/api/v1` (you will be told the address) |
| **Auth** | `Authorization: Bearer <your key>` |
| **Format** | JSON by default; CSV with `?format=csv` on the two data endpoints |
| **Rate limit** | 120 requests per minute per key |
| **Timestamps** | ISO 8601, always UTC (`2026-10-08T03:25:00.000Z`) |

## Quick start

```bash
export KEY="sck_..."          # the key you were given
export BASE="https://<your-silocentral-address>/api/v1"

# Which sites can I read?
curl "$BASE/sites" -H "Authorization: Bearer $KEY"

# The current level of every silo
curl "$BASE/levels" -H "Authorization: Bearer $KEY"

# Hourly history for one site, 1-14 September (UTC)
curl "$BASE/history?site=riverside&from=2026-09-01&to=2026-09-14&interval=1h" \
  -H "Authorization: Bearer $KEY"
```

## Authentication

Send your key as a Bearer token on every request. Keep it secret and keep it on the server side of your
system: anyone holding it can read your sites' data. Never put it in a URL or in browser code.

The key is issued once and cannot be shown again. If it is lost or leaks, ask for a new one; the old one
stops working the moment the new one is made.

| Problem | Response |
|---|---|
| No `Authorization` header, or a key that is not recognised | `401` |
| More than 120 requests in a minute | `429`, with a `Retry-After` header (seconds) |

## Sites

### `GET /sites`

The sites your key can read, and whether each is online. Light enough to poll.

```json
{
  "generatedAt": "2026-10-08T03:30:00.000Z",
  "sites": [
    {
      "slug": "riverside",
      "name": "Riverside Yard",
      "online": true,
      "lastSeenAt": "2026-10-08T03:29:41.000Z"
    }
  ]
}
```

| Field | Notes |
|---|---|
| `slug` | The site's short identifier. Use it as the `site` parameter below. |
| `online` | `true` if the site has been in contact within the last 2 minutes. |
| `lastSeenAt` | When the site last made contact, or `null` if it never has. |

## Current levels

### `GET /levels`

The most recent reading of every silo on every site you can read. Sites report about once a minute, so
there is no benefit in calling this more often than that.

| Parameter | Notes |
|---|---|
| `site` | Optional. A site `slug`, to get just that site. |
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
| `currentValue` | number or null | The raw reading in the silo's own `unit`. `null` if it has never been read. |
| `capacity` | number | The full reading, in the same `unit` as `currentValue`. |
| `feedWeightTonnes` | number or null | The manufacturer's stated weight of feed when the silo is full, in tonnes. `null` if it has not been set. |
| `feedStoredTonnes` | number or null | Tonnes of feed in the silo now: `percent` (limited to 0-100) of `feedWeightTonnes`. `null` if there is no feed weight. |
| `lastReadAt` | string or null | When the silo's sensor was last read successfully. |
| `status` | string | See below. |

**`status`** is one of `ok`, `low`, `critical`, `high` or `offline`. `critical` and `low` mean the level
is at or below the silo's alarm thresholds, `high` that it is at or above its high threshold. `offline`
means the silo's **sensor** has not answered for over 2 minutes, which is not the same as the **site**
being offline. When a site is offline (`online: false`), its silos show the last values it reported, so
check `online` before trusting them as live.

## History

### `GET /history`

Past fill levels, grouped by site and silo.

| Parameter | Default | Notes |
|---|---|---|
| `from` | 24 hours before `to` | Start of the range, inclusive. |
| `to` | now | End of the range. See below for how a date is treated. |
| `interval` | `1h` | `raw`, `5m`, `15m`, `1h` or `1d`. See below. |
| `site` | all your sites | A site `slug`. |
| `page` | all pages | A page `slug`, as in `/levels`. |
| `silo` | all silos | A silo name, matched exactly. |
| `format` | `json` | `json` or `csv`. |

**Dates.** `from` and `to` accept either a date or a full date-time:

- `2026-09-14` is the whole of that day in UTC. As a `to`, it includes the 14th.
- `2026-09-14T08:30:00Z` or `2026-09-14T20:30:00+12:00` is that exact moment. As a `to`, readings
  before that moment are included. A date-time with no zone is read as UTC.

**Intervals.** The readings in each interval are averaged into one point, and `t` is the start of that
interval. `raw` returns every stored reading, one every minute or so. An interval with no readings has no
point, so gaps in the data show up as gaps in the list.

**Limits.** A range can be at most 366 days. A single response can hold at most 50,000 data points; if a
request would return more, you get a `422` with `"code": "too_many_rows"` and nothing else. Ask for a
shorter range, a coarser interval, or one site or silo at a time. A year of `1h` data for one silo is about
8,800 points.

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
**current** `feedWeightTonnes`, so if that weight was changed during the period, older points use the new
value. `feedStoredTonnes` is `null` for silos with no feed weight.

## CSV

Add `format=csv` to `/levels` or `/history` to get a file instead of JSON. The response is UTF-8 with
`Content-Type: text/csv`, a header row, and Windows (CRLF) line endings. Empty fields are blank.

`/levels`:

```
site,site_online,site_last_seen_at,page,silo,status,percent,current_value,capacity,unit,feed_weight_tonnes,feed_stored_tonnes,last_read_at
```

`/history`:

```
site,page,silo,timestamp,percent,feed_stored_tonnes
```

Site, page and silo names that begin with `=`, `+`, `-` or `@` are written with a leading apostrophe so a
spreadsheet cannot run them as a formula. If you parse the file with software rather than opening it in a
spreadsheet, strip a single leading `'` from those text columns.

## Errors

Errors are JSON, `{ "error": "..." }`, with an appropriate HTTP status.

| Status | Meaning |
|---|---|
| `400` | A parameter is invalid; the message says which and how. |
| `401` | Missing or unrecognised key. |
| `404` | No such site. A site you cannot read gets the same answer as one that does not exist. |
| `422` | The request would return more than 50,000 data points (`"code": "too_many_rows"`). |
| `429` | Rate limit exceeded. Wait `Retry-After` seconds. |

## Good practice

- Poll `/levels` no more than once a minute. For history, ask for just the time since your last call
  (`from` = the last `t` you stored) rather than the whole range each time.
- Store timestamps as UTC and convert for display.
- Treat unknown fields in a response as additions, not errors. New fields may be added to `/api/v1` without
  notice; fields will not be renamed or removed without a new version path.

### Example: Python

```python
import os, requests

BASE = "https://<your-silocentral-address>/api/v1"
HEADERS = {"Authorization": f"Bearer {os.environ['SILOCENTRAL_KEY']}"}

for site in requests.get(f"{BASE}/levels", headers=HEADERS, timeout=30).json()["sites"]:
    for page in site["pages"]:
        for silo in page["silos"]:
            tonnes = silo["feedStoredTonnes"]
            print(site["name"], silo["name"], f"{silo['percent']}%", f"{tonnes} t" if tonnes is not None else "")
```
