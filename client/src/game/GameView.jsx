import React, { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";

const DEFAULT_MAP = { w: 50, h: 50, tile: 32 };
const INTERPOLATION_DELAY = 100; // ms

const COLORS = {
  background: 0x0b1016,
  grid: 0x2a3a4f,
  rock: 0x2b0f4d,
  facing: 0xf1f5ff,
  name: 0xe8eef5,
  nameStroke: 0x0b1016,
  player: 0x4cc2ff,
  playerSelf: 0x53f5a5
};

const TILE_TYPES = {
  empty: 0,
  rock: 1,
  crystalGreen: 2,
  crystalBlue: 3,
  crystalWhite: 4,
  crystalRed: 5,
  crystalPink: 6,
  crystalCyan: 7
};

function crystalColor(type) {
  switch (type) {
    case TILE_TYPES.crystalGreen:
      return 0x38d86b;
    case TILE_TYPES.crystalBlue:
      return 0x4da3ff;
    case TILE_TYPES.crystalWhite:
      return 0xf0f4ff;
    case TILE_TYPES.crystalRed:
      return 0xff5d5d;
    case TILE_TYPES.crystalPink:
      return 0xff7fd6;
    case TILE_TYPES.crystalCyan:
      return 0x5ee9ff;
    default:
      return null;
  }
}

const FACING_ROTATIONS = new Map([
  ["0,-1", 0],
  ["1,0", Math.PI / 2],
  ["0,1", Math.PI],
  ["-1,0", -Math.PI / 2]
]);

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export default function GameView({ token, onAuthExpired }) {
  const containerRef = useRef(null);
  const mapWrapRef = useRef(null);
  const mapCanvasRef = useRef(null);
  const mapDrawRafRef = useRef(null);
  const mapOpenRef = useRef(false);
  const socketRef = useRef(null);
  const chatFocusRef = useRef(false);
  const mapViewRef = useRef({ zoom: 1, panX: 0, panY: 0, lastX: 0, lastY: 0 });
  const mapDataRef = useRef({
    w: DEFAULT_MAP.w,
    h: DEFAULT_MAP.h,
    tiles: null,
    players: new Map(),
    playerId: null
  });
  const mapHoverRef = useRef({ x: null, y: null, inside: false });
  const [status, setStatus] = useState("connecting");
  const [playerCount, setPlayerCount] = useState(0);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [wallet, setWallet] = useState({ dollars: 0, coins: 0 });
  const [hp, setHp] = useState({ current: 100, max: 100 });
  const [inventory, setInventory] = useState({
    green: 0,
    blue: 0,
    white: 0,
    red: 0,
    pink: 0,
    cyan: 0
  });
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatFocused, setChatFocused] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapPanning, setMapPanning] = useState(false);
  const [mapHover, setMapHover] = useState({ x: null, y: null, inside: false });

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function requestMapDraw() {
    if (!mapOpenRef.current) return;
    if (mapDrawRafRef.current) return;
    mapDrawRafRef.current = window.requestAnimationFrame(() => {
      mapDrawRafRef.current = null;
      drawWorldMap();
    });
  }

  function drawWorldMap() {
    const wrap = mapWrapRef.current;
    const canvas = mapCanvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    if (width === 0 || height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, width, height);

    const { w, h, tiles, players, playerId } = mapDataRef.current;
    if (!w || !h) return;
    const baseScale = Math.min(width / w, height / h);
    const zoom = mapViewRef.current.zoom;
    const scale = baseScale * zoom;
    const panX = mapViewRef.current.panX;
    const panY = mapViewRef.current.panY;
    const originX = (width - w * scale) / 2 + panX;
    const originY = (height - h * scale) / 2 + panY;

    ctx.fillStyle = "#141c25";
    ctx.fillRect(originX, originY, w * scale, h * scale);

    if (tiles) {
      for (let y = 0; y < h; y += 1) {
        const row = tiles[y];
        if (!row) continue;
        for (let x = 0; x < w; x += 1) {
          const type = row[x];
          let color = null;
          if (type === TILE_TYPES.rock) color = "#2b0f4d";
          if (type === TILE_TYPES.crystalGreen) color = "#38d86b";
          if (type === TILE_TYPES.crystalBlue) color = "#4da3ff";
          if (type === TILE_TYPES.crystalWhite) color = "#f0f4ff";
          if (type === TILE_TYPES.crystalRed) color = "#ff5d5d";
          if (type === TILE_TYPES.crystalPink) color = "#ff7fd6";
          if (type === TILE_TYPES.crystalCyan) color = "#5ee9ff";
          if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(
              originX + x * scale,
              originY + y * scale,
              scale,
              scale
            );
          }
        }
      }
    }

    const radius = Math.max(2, Math.min(6, scale * 0.4));
    for (const [id, p] of players.entries()) {
      const px = originX + (p.tx + 0.5) * scale;
      const py = originY + (p.ty + 0.5) * scale;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = id === playerId ? "#ff4d4d" : "#7dd3fc";
      ctx.fill();
    }
  }

  function zoomMapAt(clientX, clientY, factor) {
    const wrap = mapWrapRef.current;
    if (!wrap) return;
    const { w, h } = mapDataRef.current;
    if (!w || !h) return;

    const rect = wrap.getBoundingClientRect();
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    const baseScale = Math.min(width / w, height / h);
    const view = mapViewRef.current;
    const prevScale = baseScale * view.zoom;
    const originX = (width - w * prevScale) / 2 + view.panX;
    const originY = (height - h * prevScale) / 2 + view.panY;

    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const worldX = (screenX - originX) / prevScale;
    const worldY = (screenY - originY) / prevScale;

    const nextZoom = clamp(view.zoom * factor, 0.1, 12);
    const nextScale = baseScale * nextZoom;
    const nextOriginX = screenX - worldX * nextScale;
    const nextOriginY = screenY - worldY * nextScale;
    view.panX = nextOriginX - (width - w * nextScale) / 2;
    view.panY = nextOriginY - (height - h * nextScale) / 2;
    view.zoom = nextZoom;
    requestMapDraw();
  }

  function handleMapWheel(event) {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.9 : 1.1;
    zoomMapAt(event.clientX, event.clientY, factor);
  }

  function handleMapMouseDown(event) {
    if (event.button !== 0) return;
    mapViewRef.current.lastX = event.clientX;
    mapViewRef.current.lastY = event.clientY;
    setMapPanning(true);
    updateMapHover(event.clientX, event.clientY);
  }

  function handleMapMouseMove(event) {
    if (mapPanning) {
      const view = mapViewRef.current;
      const dx = event.clientX - view.lastX;
      const dy = event.clientY - view.lastY;
      view.panX += dx;
      view.panY += dy;
      view.lastX = event.clientX;
      view.lastY = event.clientY;
      requestMapDraw();
    }
    updateMapHover(event.clientX, event.clientY);
  }

  function handleMapMouseUp() {
    setMapPanning(false);
  }

  function handleMapMouseLeave() {
    setMapPanning(false);
    if (mapHoverRef.current.inside) {
      mapHoverRef.current = { x: null, y: null, inside: false };
      setMapHover({ x: null, y: null, inside: false });
    }
  }

  function updateMapHover(clientX, clientY) {
    const wrap = mapWrapRef.current;
    if (!wrap) return;
    const { w, h } = mapDataRef.current;
    if (!w || !h) return;
    const rect = wrap.getBoundingClientRect();
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    if (width === 0 || height === 0) return;
    const baseScale = Math.min(width / w, height / h);
    const view = mapViewRef.current;
    const scale = baseScale * view.zoom;
    const originX = (width - w * scale) / 2 + view.panX;
    const originY = (height - h * scale) / 2 + view.panY;
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const worldX = (screenX - originX) / scale;
    const worldY = (screenY - originY) / scale;
    const inside =
      worldX >= 0 && worldY >= 0 && worldX < w && worldY < h;
    if (!inside) {
      if (mapHoverRef.current.inside) {
        mapHoverRef.current = { x: null, y: null, inside: false };
        setMapHover({ x: null, y: null, inside: false });
      }
      return;
    }
    const nextX = Math.floor(worldX);
    const nextY = Math.floor(worldY);
    const prev = mapHoverRef.current;
    if (prev.x !== nextX || prev.y !== nextY || !prev.inside) {
      mapHoverRef.current = { x: nextX, y: nextY, inside: true };
      setMapHover({ x: nextX, y: nextY, inside: true });
    }
  }

  useEffect(() => {
    mapOpenRef.current = mapOpen;
    if (mapOpen) {
      mapViewRef.current.zoom = 1;
      mapViewRef.current.panX = 0;
      mapViewRef.current.panY = 0;
      requestMapDraw();
    } else {
      setMapPanning(false);
    }
  }, [mapOpen]);

  useEffect(() => {
    chatFocusRef.current = chatFocused;
  }, [chatFocused]);

  useEffect(() => {
    if (!mapOpen) return undefined;
    const handleResize = () => requestMapDraw();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mapOpen]);

  useEffect(() => {
    if (!token) return undefined;

    let app;
    let world;
    let grid;
    let gridLines;
    let terrain;
    let effectsLayer;
    let playersLayer;
    let resizeObserver;
    let socket;
    let inputInterval;
    const effects = [];

    const state = {
      playerId: null,
      map: { ...DEFAULT_MAP },
      serverTimeOffset: 0,
      snapshots: [],
      players: new Map(),
      keys: {
        up: false,
        down: false,
        left: false,
        right: false,
        ctrl: false,
        mine: false
      }
    };

    function drawGrid() {
      const { w, h, tile } = state.map;
      grid.clear();
      grid.beginFill(COLORS.background);
      grid.drawRect(0, 0, w * tile, h * tile);
      grid.endFill();
      gridLines.clear();
      gridLines.lineStyle(1, COLORS.grid, 0.9);
      for (let x = 0; x <= w; x += 1) {
        gridLines.moveTo(x * tile, 0);
        gridLines.lineTo(x * tile, h * tile);
      }
      for (let y = 0; y <= h; y += 1) {
        gridLines.moveTo(0, y * tile);
        gridLines.lineTo(w * tile, y * tile);
      }
    }

    function drawTerrain() {
      const { w, h, tile, tiles } = state.map;
      terrain.clear();
      if (!tiles) return;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const type = tiles[y]?.[x];
          let color = null;
          if (type === TILE_TYPES.rock) color = COLORS.rock;
          if (type === TILE_TYPES.crystalGreen) color = 0x38d86b;
          if (type === TILE_TYPES.crystalBlue) color = 0x4da3ff;
          if (type === TILE_TYPES.crystalWhite) color = 0xf0f4ff;
          if (type === TILE_TYPES.crystalRed) color = 0xff5d5d;
          if (type === TILE_TYPES.crystalPink) color = 0xff7fd6;
          if (type === TILE_TYPES.crystalCyan) color = 0x5ee9ff;
          if (color !== null) {
            terrain.beginFill(color);
            terrain.drawRect(x * tile, y * tile, tile, tile);
            terrain.endFill();
          }
        }
      }
    }

    function getPlayerSprite(id) {
      let sprite = state.players.get(id);
      if (!sprite) {
        sprite = new Container();
        const body = new Graphics();
        const color = id === state.playerId ? COLORS.playerSelf : COLORS.player;
        body.beginFill(color);
        body.drawRect(-12, -12, 24, 24);
        body.endFill();
        const facing = new Graphics();
        facing.beginFill(COLORS.facing);
        facing.drawPolygon([
          0,
          -18,
          -5,
          -10,
          5,
          -10
        ]);
        facing.endFill();
        const label = new Text("", {
          fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
          fontSize: 12,
          fill: COLORS.name,
          stroke: COLORS.nameStroke,
          strokeThickness: 3,
          align: "center"
        });
        if (label.anchor) {
          label.anchor.set(0.5);
        }
        label.position.set(0, -22);
        sprite.body = body;
        sprite.facingGraphic = facing;
        sprite.label = label;
        sprite.addChild(body);
        sprite.addChild(facing);
        sprite.addChild(label);
        playersLayer.addChild(sprite);
        state.players.set(id, sprite);
      }
      return sprite;
    }

    function removeMissingPlayers(activeIds) {
      for (const [id, sprite] of state.players.entries()) {
        if (!activeIds.has(id)) {
          playersLayer.removeChild(sprite);
          sprite.destroy({ children: true });
          state.players.delete(id);
        }
      }
    }

    function updateInputKey(key, pressed) {
      if (chatFocusRef.current) return;
      if (key === "KeyW" || key === "ArrowUp") state.keys.up = pressed;
      if (key === "KeyS" || key === "ArrowDown") state.keys.down = pressed;
      if (key === "KeyA" || key === "ArrowLeft") state.keys.left = pressed;
      if (key === "KeyD" || key === "ArrowRight") state.keys.right = pressed;
      if (key === "ControlLeft" || key === "ControlRight")
        state.keys.ctrl = pressed;
      if (key === "KeyZ") state.keys.mine = pressed;
    }

    function currentDir() {
      let x = 0;
      let y = 0;
      if (state.keys.left) x -= 1;
      if (state.keys.right) x += 1;
      if (state.keys.up) y -= 1;
      if (state.keys.down) y += 1;
      if (x !== 0 && y !== 0) {
        y = 0;
      }
      return { x, y };
    }

    function pushSnapshot(msg) {
      const map = new Map();
      for (const p of msg.players) {
        map.set(p.id, p);
      }
      state.snapshots.push({ time: msg.time, map });
      mapDataRef.current.players = map;
      mapDataRef.current.playerId = state.playerId;
      requestMapDraw();
      if (state.snapshots.length > 30) {
        state.snapshots.shift();
      }
      setPlayerCount(map.size);
      const me = state.playerId ? map.get(state.playerId) : null;
      if (me) {
        setCoords({ x: me.tx, y: me.ty });
      }
    }

    function render() {
      const dtMs = app?.ticker?.deltaMS ?? 16;
      for (let i = effects.length - 1; i >= 0; i -= 1) {
        const effect = effects[i];
        effect.age += dtMs;
        const t = Math.min(1, effect.age / effect.duration);
        if (t >= 1) {
          effectsLayer.removeChild(effect.sprite);
          effect.sprite.destroy();
          effects.splice(i, 1);
        } else if (effect.kind === "float") {
          effect.sprite.alpha = 1 - t;
          effect.sprite.y = effect.startY - t * 14;
        } else {
          effect.sprite.alpha = 1 - t;
          const scale = 1 + t * 0.6;
          effect.sprite.scale.set(scale);
        }
      }

      if (state.snapshots.length === 0) return;

      const now = performance.now();
      const serverNow = now - state.serverTimeOffset;
      const renderTime = serverNow - INTERPOLATION_DELAY;

      let older = null;
      let newer = null;

      for (let i = state.snapshots.length - 1; i >= 0; i -= 1) {
        const snap = state.snapshots[i];
        if (snap.time <= renderTime) {
          older = snap;
          newer = state.snapshots[i + 1] || snap;
          break;
        }
      }

      if (!older) {
        older = state.snapshots[0];
        newer = state.snapshots[1] || older;
      }

      const span = newer.time - older.time || 1;
      const t = Math.max(0, Math.min(1, (renderTime - older.time) / span));

      const ids = new Set();
      for (const id of older.map.keys()) ids.add(id);
      for (const id of newer.map.keys()) ids.add(id);

      const activeIds = new Set();
      let localPosition = null;

      const { tile } = state.map;
      for (const id of ids) {
        const a = older.map.get(id) || newer.map.get(id);
        const b = newer.map.get(id) || a;
        if (!a || !b) continue;
        const x = (lerp(a.tx, b.tx, t) + 0.5) * tile;
        const y = (lerp(a.ty, b.ty, t) + 0.5) * tile;
        const sprite = getPlayerSprite(id);
        sprite.position.set(x, y);

        const fx = b.fx ?? a.fx;
        const fy = b.fy ?? a.fy;
        if (fx !== undefined && fy !== undefined && (fx !== 0 || fy !== 0)) {
          const rot = FACING_ROTATIONS.get(`${fx},${fy}`) ?? 0;
          if (sprite.facingGraphic) {
            sprite.facingGraphic.rotation = rot;
          }
        }
        const name =
          id === state.playerId ? "" : b.name || a.name || "";
        if (sprite.label && sprite.label.text !== name) {
          sprite.label.text = name;
          if (sprite.label.anchor) {
            sprite.label.anchor.set(0.5);
          } else {
            sprite.label.position.set(-sprite.label.width / 2, -22);
          }
        }

        activeIds.add(id);
        if (id === state.playerId) {
          localPosition = { x, y };
        }
      }

      removeMissingPlayers(activeIds);

      if (localPosition && app) {
        world.pivot.set(localPosition.x, localPosition.y);
        world.position.set(app.renderer.width / 2, app.renderer.height / 2);
      }
    }

    async function setup() {
      const container = containerRef.current;
      if (!container) return;

      app = new Application({
        width: container.clientWidth,
        height: container.clientHeight,
        backgroundColor: COLORS.background,
        antialias: true
      });
      container.appendChild(app.view);

      world = new Container();
      grid = new Graphics();
      gridLines = new Graphics();
      terrain = new Graphics();
      effectsLayer = new Container();
      playersLayer = new Container();

      drawGrid();
      drawTerrain();

      world.addChild(grid);
      world.addChild(terrain);
      world.addChild(effectsLayer);
      world.addChild(gridLines);
      world.addChild(playersLayer);
      app.stage.addChild(world);

      const handleResize = () => {
        if (!app || !container) return;
        app.renderer.resize(container.clientWidth, container.clientHeight);
      };

      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);

      const onKeyDown = (event) => {
        if (event.code === "KeyM" && !event.repeat) {
          setMapOpen((prev) => !prev);
          return;
        }
        if (event.code === "Escape" && mapOpenRef.current) {
          setMapOpen(false);
          return;
        }
        updateInputKey(event.code, true);
      };
      const onKeyUp = (event) => updateInputKey(event.code, false);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);

      const baseUrl =
        import.meta.env.VITE_SERVER_URL || "ws://localhost:8080";
      const serverUrl = `${baseUrl}?token=${encodeURIComponent(token)}`;
      socket = new WebSocket(serverUrl);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        setStatus("online");
      });

      socket.addEventListener("close", (event) => {
        if (event.code === 4001) {
          setStatus("unauthorized");
          if (onAuthExpired) onAuthExpired();
          return;
        }
        setStatus("offline");
      });

      socket.addEventListener("message", (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.t === "welcome") {
          state.playerId = msg.id;
          mapDataRef.current.playerId = msg.id;
          state.serverTimeOffset = performance.now() - msg.time;
          if (msg.map) {
            state.map = { ...state.map, ...msg.map };
            mapDataRef.current.w = state.map.w;
            mapDataRef.current.h = state.map.h;
            mapDataRef.current.tiles = state.map.tiles || null;
            drawGrid();
            drawTerrain();
            requestMapDraw();
          }
          if (msg.wallet) {
            setWallet({
              dollars: Number(msg.wallet.dollars || 0),
              coins: Number(msg.wallet.coins || 0)
            });
          }
          if (msg.hp) {
            setHp({
              current: Number(msg.hp.current || 0),
              max: Number(msg.hp.max || 0)
            });
          }
          if (msg.inventory) {
            setInventory({
              green: Number(msg.inventory.green || 0),
              blue: Number(msg.inventory.blue || 0),
              white: Number(msg.inventory.white || 0),
              red: Number(msg.inventory.red || 0),
              pink: Number(msg.inventory.pink || 0),
              cyan: Number(msg.inventory.cyan || 0)
            });
          }
        }

        if (msg.t === "state") {
          pushSnapshot(msg);
        }

        if (msg.t === "tile") {
          if (state.map.tiles && state.map.tiles[msg.y]) {
            state.map.tiles[msg.y][msg.x] = msg.value;
            mapDataRef.current.tiles = state.map.tiles;
            drawTerrain();
            requestMapDraw();
          }
        }

        if (msg.t === "inventory" && msg.inventory) {
          setInventory({
            green: Number(msg.inventory.green || 0),
            blue: Number(msg.inventory.blue || 0),
            white: Number(msg.inventory.white || 0),
            red: Number(msg.inventory.red || 0),
            pink: Number(msg.inventory.pink || 0),
            cyan: Number(msg.inventory.cyan || 0)
          });
        }

        if (msg.t === "hit") {
          const { tile } = state.map;
          if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
            const spark = new Graphics();
            spark.lineStyle(2, 0xffc36a, 0.9);
            spark.drawCircle(0, 0, Math.max(4, tile * 0.2));
            spark.lineStyle(2, 0xfff2b0, 0.8);
            spark.moveTo(-tile * 0.2, 0);
            spark.lineTo(tile * 0.2, 0);
            spark.position.set(
              (msg.x + 0.5) * tile,
              (msg.y + 0.5) * tile
            );
            effectsLayer.addChild(spark);
            effects.push({
              sprite: spark,
              age: 0,
              duration: 160,
              kind: "spark"
            });

            if (msg.amount && msg.amount > 0) {
              const color = crystalColor(msg.type);
              if (color !== null) {
                const text = new Text(`+${msg.amount}`, {
                  fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
                  fontSize: 14,
                  fill: color,
                  stroke: 0x0b1016,
                  strokeThickness: 3
                });
                if (text.anchor) {
                  text.anchor.set(0.5);
                }
                text.position.set(
                  (msg.x + 0.5) * tile,
                  (msg.y + 0.5) * tile - 6
                );
                effectsLayer.addChild(text);
                effects.push({
                  sprite: text,
                  age: 0,
                  duration: 600,
                  kind: "float",
                  startY: text.y
                });
              }
            }
          }
        }

        if (msg.t === "chat") {
          setChatMessages((prev) => {
            const next = [
              ...prev,
              {
                from: msg.from || "unknown",
                text: msg.msg || "",
                time: msg.time || Date.now()
              }
            ];
            return next.slice(-60);
          });
        }
      });

      inputInterval = setInterval(() => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(
          JSON.stringify({
            t: "input",
            dir: currentDir(),
            ctrl: state.keys.ctrl,
            mine: state.keys.mine
          })
        );
      }, 50);

      app.ticker.add(render);

      return () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
      };
    }

    let cleanupKeys;
    setup().then((cleanup) => {
      cleanupKeys = cleanup;
    });

    return () => {
      if (cleanupKeys) cleanupKeys();
      if (inputInterval) clearInterval(inputInterval);
      if (socket) socket.close();
      socketRef.current = null;
      if (resizeObserver) resizeObserver.disconnect();
      if (app) {
        app.destroy(true, { children: true });
      }
    };
  }, [token, onAuthExpired]);

  function submitChat(event) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ t: "chat", msg: text }));
    setChatInput("");
  }

  return (
    <div className="game-wrap">
      <div ref={containerRef} className="game-wrap" />
      <div className="hud-stack">
        <div className="game-overlay">
          <div className="hud-currency">
            <div className="currency-item">
              <span className="currency-dot currency-dollar" />
              ${wallet.dollars}
            </div>
            <div className="currency-item">
              <span className="currency-dot currency-coin" />
              {wallet.coins} coins
            </div>
            <div className="currency-item hp-item">
              <span className="hp-label">HP</span>
              <span className="hp-value">
                {hp.current}/{hp.max}
              </span>
            </div>
          </div>
          <div>Status: {status}</div>
          <div>Players: {playerCount}</div>
          <div>
            X: {coords.x} Y: {coords.y}
          </div>
          <div>WASD or Arrows to move</div>
        </div>
        <div className="game-overlay inventory-overlay">
          <div className="inventory-title">Inventory</div>
          <div className="inventory-list">
            <div className="inventory-line">
              <span className="inventory-label">Green</span>
              <span className="inventory-value crystal-green-text">
                {inventory.green}
              </span>
            </div>
            <div className="inventory-line">
              <span className="inventory-label">Blue</span>
              <span className="inventory-value crystal-blue-text">
                {inventory.blue}
              </span>
            </div>
            <div className="inventory-line">
              <span className="inventory-label">White</span>
              <span className="inventory-value crystal-white-text">
                {inventory.white}
              </span>
            </div>
            <div className="inventory-line">
              <span className="inventory-label">Red</span>
              <span className="inventory-value crystal-red-text">
                {inventory.red}
              </span>
            </div>
            <div className="inventory-line">
              <span className="inventory-label">Pink</span>
              <span className="inventory-value crystal-pink-text">
                {inventory.pink}
              </span>
            </div>
            <div className="inventory-line">
              <span className="inventory-label">Cyan</span>
              <span className="inventory-value crystal-cyan-text">
                {inventory.cyan}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="chat-panel">
        <div className="chat-title">Chat</div>
        <div className="chat-messages">
          {chatMessages.map((msg, index) => (
            <div key={`${msg.time}-${index}`} className="chat-line">
              <span className="chat-name">{msg.from}:</span>
              <span className="chat-text">{msg.text}</span>
            </div>
          ))}
        </div>
        <form className="chat-input-row" onSubmit={submitChat}>
          <input
            className="chat-input"
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            onFocus={() => setChatFocused(true)}
            onBlur={() => setChatFocused(false)}
            placeholder="Type message..."
            maxLength={160}
          />
        </form>
      </div>
      {mapOpen ? (
        <div
          className={`world-map${mapPanning ? " is-panning" : ""}`}
          ref={mapWrapRef}
          onMouseDown={handleMapMouseDown}
          onMouseMove={handleMapMouseMove}
          onMouseUp={handleMapMouseUp}
          onMouseLeave={handleMapMouseLeave}
          onWheel={handleMapWheel}
        >
          <canvas ref={mapCanvasRef} className="map-canvas" />
          <div className="map-header">
            <div className="map-hint">
              M or Esc to close / Wheel to zoom / Drag to pan
            </div>
            <div className="map-coords">
              <span className="map-coord">
                You: X {coords.x} Y {coords.y}
              </span>
              <span className="map-coord map-coord-hover">
                Hover:{" "}
                {mapHover.inside
                  ? `X ${mapHover.x} Y ${mapHover.y}`
                  : "X -- Y --"}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
