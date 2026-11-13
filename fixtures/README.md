# fixtures/

Shared test fixtures for the Local Rescue Bid API. Each row names the endpoint and scenario it covers.
Fixtures marked **\_derived** were not present in `demo_expected.json` or `holdout_expected.json`; they are derived from `match-j01.json` and must be verified against the real API before trusting their expected values.

## Response fixtures

| File | Endpoint | Scenario | Derived |
|------|----------|----------|---------|
| `extract-j01.json` | `POST /extract` | J01 — clean extraction, no issues, remaining_quantity 180 | No |
| `extract-j04.json` | `POST /extract` | J04 — tolerance missing; `issues[{field:'tolerance_half_width_mm', reason:'missing'}]` | No |
| `extract-j08.json` | `POST /extract` | J08 — tolerance conflicting (0.05 mm drawing vs 0.10 mm release); `issues[{reason:'conflicting'}]` | No |
| `match-j01.json` | `POST /match` | J01 — status matched, ranked [S02, S08], recommended S02 (10:15 AM ET), S01 ineligible tolerance_too_loose | No |
| `match-j01-s02-delayed.json` | `POST /match` | J01 — S02 lot_ready_at overridden to 11:45 AM ET; S08 (Sterling Heights) ranks first | **Yes** |
| `match-j01-no-match.json` | `POST /match` | J01 — S02 delayed to 11:45 AM ET and S08 max_parts_in_slot 179; status no_match, recommended_shop_id null | **Yes** |

## Request fixtures (`requests/`)

| File | Endpoint | Scenario |
|------|----------|----------|
| `requests/extract-j01.request.json` | `POST /extract` | J01 packet text |
| `requests/extract-j04.request.json` | `POST /extract` | J04 packet text |
| `requests/extract-j08.request.json` | `POST /extract` | J08 packet text |
| `requests/match-j01.request.json` | `POST /match` | J01 confirmed requirements |
| `requests/match-j01-s02-delayed.request.json` | `POST /match` | J01 requirements + overrides: S02 lot_ready_at 11:45 AM ET |
| `requests/match-j01-no-match.request.json` | `POST /match` | J01 requirements + overrides: S02 lot_ready_at 11:45 AM ET, S08 max_parts_in_slot 179 |
