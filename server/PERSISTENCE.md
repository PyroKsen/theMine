# Persistence And Migrations

## Current Layout
- `server/data/themine.db` is the source of truth for users, buildings, and drop boxes.
- `server/data/map.bin` stores terrain tile ids.
- `server/data/tile_hp.json` stores sparse HP overrides for tiles whose HP differs from the default for their tile type.
- `server/data/buildings.bin` is a derived cache for building occupancy and is repaired from SQLite on startup.
- `server/data/world_meta.json` stores world persistence schema version and migration history.

## Versioned Schemas
- SQLite schema version is tracked with `PRAGMA user_version`.
- DB migrations live in [server/lib/dbMigrations.js](/E:/theMine/server/lib/dbMigrations.js).
- World persistence schema version is tracked in `world_meta.json`.
- World migrations live in [server/lib/persistence.js](/E:/theMine/server/lib/persistence.js).
- `npm -w server run inspect:persistence` prints the current DB/world schema state from `server/data`.

## Rule: Migrations, Not Ad-Hoc Schema Changes
When persistence changes, do not modify old migration steps in place unless the repo is still fully disposable and no shared data matters.

Instead:
1. Add a new DB migration with version `N + 1` in `dbMigrations.js`.
2. Or add a new world migration with version `N + 1` in `persistence.js`.
3. Bump the exported current schema version.
4. Keep previous migrations intact so older worlds/databases can still upgrade.

## What Counts As A DB Migration
Use a DB migration when changing anything inside `themine.db`, for example:
- adding a user column
- adding a new table
- changing indexes or constraints
- moving a domain from file storage into SQLite

DB migrations should be:
- forward-only
- idempotent enough for legacy adoption paths
- small and explicit

## What Counts As A World Migration
Use a world migration when changing persistence layout outside SQLite, for example:
- adding a new world metadata field
- changing the declared source of truth for a domain
- introducing a new persisted world file
- retiring a legacy file from runtime persistence

World migrations should describe storage layout changes, not runtime repairs.

## Repair Is Not Migration
`validateAndRepairWorldState()` is for restoring derived or inconsistent runtime state after startup.

Examples of repair work:
- rebuild `buildings.bin` from SQLite buildings
- restore missing drop-box tiles from SQLite
- clear invalid respawn selections
- remove impossible overlaps or terrain conflicts

If a change means old persisted data must be upgraded to a new schema, that belongs in migrations first, then repair may run afterward.

## Startup Order
1. Open SQLite and run DB migrations.
2. Open world persistence and run world metadata migrations.
3. Run repair/validation.
4. Flush repaired state.
5. Start realtime server.

## Adding A New Persistence Change
Example checklist:
1. Decide whether the change is DB, world, or both.
2. Add a new migration step.
3. Update the latest schema version constant.
4. Update `WORLD_SOURCES_OF_TRUTH` if world layout changed.
5. Add or extend recovery smoke-tests.
6. Run `npm -w server run test:recovery`.
7. Run `npm -w server run inspect:persistence` on a real data directory if you changed startup storage layout.

## Recovery Tests
Recovery smoke-tests live in [server/scripts/recoverySmoke.js](/E:/theMine/server/scripts/recoverySmoke.js).

They should cover:
- migration adoption of old persistence
- repair of derived caches
- restart persistence of changed data
- cleanup of invalid or conflicting rows/files

## Practical Policy
- Prefer additive migrations over rewriting old history.
- Keep repair deterministic and safe to re-run.
- Keep derived caches rebuildable.
- Keep source-of-truth ownership explicit in `world_meta.json`.
