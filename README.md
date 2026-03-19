# theMine

theMine is a 2D real-time online prototype inspired by sandbox automation games like ERZ Online. The core fantasy is to control a small mining robot, explore a tiled world, extract resources, build a base, and trade with other players in a shared economy.

This repo is a monorepo that contains both the desktop client and the authoritative game server. The current build is a playable multiplayer prototype with a tiled map, real-time movement, and synchronized player positions.

## Current Features
1. 2D top-down tiled world (50x50 tiles)
2. Real-time multiplayer over WebSocket
3. Authoritative server simulation (client only sends input)
4. Grid-locked movement (one tile per step)
5. Simple camera that follows the local player
6. Live HUD with status, player count, and coordinates

## Gameplay Concept (Planned)
1. Robots mine resources from tiles
2. Resources are stored in inventory or base storage
3. Players build infrastructure to automate extraction
4. A player-driven economy enables trade and specialization

## Tech Stack
1. Client: Electron + React + Vite + PixiJS
2. Server: Node.js + ws
3. Protocol: JSON messages over WebSocket

## Architecture
1. The server is authoritative and ticks at a fixed rate.
2. Clients send input directions, not positions.
3. The server broadcasts snapshots of all player positions.
4. The client interpolates snapshots for smooth rendering.

## World Persistence
1. Terrain is stored in `server/data/map.bin`.
2. Tile HP overrides are stored in `server/data/tile_hp.json`.
3. Buildings are stored in the `buildings` table inside `server/data/themine.db`.
4. Building occupancy cache is stored in `server/data/buildings.bin` and repaired from SQLite buildings on startup.
5. Drop boxes are stored in the `drop_boxes` table inside `server/data/themine.db`.
6. Player/accounts state is stored in `server/data/themine.db`.
7. World persistence metadata and world schema history are stored in `server/data/world_meta.json`.
8. Startup validation repairs `buildings.bin` and drop-box map markers before the realtime server begins accepting players.
9. Persistence and migration policy is documented in `server/PERSISTENCE.md`.

## Run (Dev)
1. Install dependencies:
```
npm install
```
2. Start server and client:
```
npm run dev
```

## Scripts
1. `npm run dev` - run server and client together
2. `npm run dev:server` - run server only
3. `npm run dev:client` - run client only
4. `npm run build` - build client
5. `npm run start` - run server (production)
6. `npm -w server run test:recovery` - run persistence and recovery smoke-tests
7. `npm -w server run inspect:persistence` - print DB/world schema versions and sources of truth from `server/data`

## Ports
1. Server: `ws://localhost:8080`
2. Client (Vite): `http://localhost:5173`

## Project Structure
1. `client/` - Electron + React + PixiJS app
2. `client/src/game/` - game renderer and networking
3. `client/electron/` - Electron main process
4. `server/` - Node.js authoritative game server
5. `server/PERSISTENCE.md` - persistence layout, migrations, and repair policy

## Roadmap (Short)
1. Tile resource data and mining actions
2. Inventory and base storage
3. Trading posts and basic economy
4. Persistence (accounts + world state)
5. Zone sharding for 50+ players per area
