# Live sync Catalyst tables

Create these Datastore tables before deploying live sync. `id` plus `user_id`
must be indexed/unique per user where Catalyst supports composite uniqueness.

`live_timers_koku`

| Column | Type |
| --- | --- |
| id, user_id, title, project_id, category_id, notes, start_at, paused_at, parent_timer_id, updated_at, deleted_at | String |
| tags | String (JSON array) |
| elapsed_before_pause_sec, revision | Number |
| pomodoro_mode | Boolean |

`live_breaks_koku`

| Column | Type |
| --- | --- |
| id, user_id, label, started_at, notes, updated_at, deleted_at | String |
| paused_timer_ids | String (JSON array) |
| planned_duration_sec, revision | Number |

`deleted_at` is live-state tombstone. API rejects stale revision writes and GET
purges tombstones older than 24 hours.
