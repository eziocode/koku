# Live sync Catalyst tables

Create these Datastore tables before deploying live sync. `id` plus `user_id`
must be indexed/unique per user where Catalyst supports composite uniqueness.

`live_timers_koku`

| Column | Type |
| --- | --- |
| id, user_id, title, project_id, category_id, parent_timer_id | String |
| notes | Text |
| start_at, paused_at, updated_at, deleted_at | DateTime |
| tags | String (JSON array) |
| elapsed_before_pause_sec, revision | Number |
| pomodoro_mode | Boolean |

`live_breaks_koku`

| Column | Type |
| --- | --- |
| id, user_id, label | String |
| notes, description | Text |
| started_at, updated_at, deleted_at | DateTime |
| paused_timer_ids | String (JSON array) |
| planned_duration_sec, revision | Number |
| project_id, category_id, tag | String |

`project_id`/`category_id`/`tag`/`description` identify a break started from a
configured quick action ("Call") rather than a plain break — see
`writeBreakEntry` in `src/lib/breaks/finalize-break.ts`. All four are nullable;
a plain break leaves them unset.

`deleted_at` is live-state tombstone. API rejects stale revision writes and GET
purges tombstones older than 24 hours.
