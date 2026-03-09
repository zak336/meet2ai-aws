import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Database
  const db = new Database("classroom.db");
  db.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT,
      query TEXT,
      response TEXT
    )
  `);

  app.use(express.json());

  // API routes
  app.get("/api/history", (req, res) => {
    const rows = db.prepare("SELECT * FROM history ORDER BY id DESC LIMIT 50").all();
    res.json(rows);
  });

  app.post("/api/history", (req, res) => {
    const { timestamp, query, response } = req.body;
    const info = db.prepare("INSERT INTO history (timestamp, query, response) VALUES (?, ?, ?)").run(timestamp, query, response);
    res.json({ id: info.lastInsertRowid });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
