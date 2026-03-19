const http = require("http");
const crypto = require("crypto");

function isUsernameActive(players, username) {
  for (const player of players.values()) {
    if (player?.username === username) {
      return true;
    }
  }
  return false;
}
function createAuthServer({
  sessions,
  players,
  stmtInsertUser,
  stmtGetUser,
  serializeSkillSlots,
  emptySkillSlots,
  skillDefaults,
  baseHp,
  spawnTx,
  spawnTy
}) {
  return http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (
      req.method !== "POST" ||
      (url.pathname !== "/login" && url.pathname !== "/register")
    ) {
      res.writeHead(404);
      res.end();
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "invalid_json" }));
        return;
      }

      const username = String(payload.username || "").trim();
      const password = String(payload.password || "");
      if (isUsernameActive(players, username)) {
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "already_online" }));
        return;
      }

      if (username.length < 3 || username.length > 20) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "bad_username" }));
        return;
      }
      if (password.length < 4 || password.length > 64) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "bad_password" }));
        return;
      }

      const hash = crypto
        .createHash("sha256")
        .update(`${username}:${password}`)
        .digest("hex");

      if (url.pathname === "/register") {
        try {
          stmtInsertUser.run(
            username,
            hash,
            Date.now(),
            spawnTx,
            spawnTy,
            null,
            serializeSkillSlots(emptySkillSlots),
            null,
            0,
            0,
            baseHp,
            baseHp,
            0,
            0,
            0,
            0,
            0,
            0,
            ...skillDefaults
          );
        } catch (err) {
          if (String(err?.code || "").includes("SQLITE_CONSTRAINT")) {
            res.writeHead(409, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "user_exists" }));
            return;
          }
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "db_error" }));
          return;
        }
      } else {
        const existing = stmtGetUser.get(username);
        if (!existing || existing.password_hash !== hash) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "invalid_credentials" }));
          return;
        }
      }

      const token = crypto.randomUUID();
      sessions.set(token, { username, createdAt: Date.now() });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, token, username }));
    });
  });
}

module.exports = {
  createAuthServer
};





