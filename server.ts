import dotenv from "dotenv";
dotenv.config({ override: true });
import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const db = new Database("orders.db");

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://gkxisegxklprgwmplaqi.supabase.co";
const supabaseProjectId = supabaseUrl.replace(/^https?:\/\//, "").split(".")[0] || "gkxisegxklprgwmplaqi";

// S3 Client Configuration (Supabase S3 API)
const s3Client = process.env.S3_ACCESS_KEY_ID ? new S3Client({
  endpoint: process.env.S3_ENDPOINT || `https://${supabaseProjectId}.storage.supabase.co/storage/v1/s3`,
  region: process.env.S3_REGION || "sa-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
}) : null;

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    items TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ready_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS sensor_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL,
    source TEXT DEFAULT 'esp32',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  // Support raw buffer on /api/supabase to forward any payload including files & JSON
  app.use("/api/supabase", express.raw({ type: "*/*", limit: "50mb" }));

  // Supabase Reverse Proxy (prevents CORS and iframe sandbox fetch failures)
  app.all("/api/supabase/*", async (req, res) => {
    try {
      const targetPath = req.originalUrl.replace(/^\/api\/supabase/, "");
      const targetUrl = `${supabaseUrl}${targetPath}`;

      const headers = new Headers();
      for (const [key, val] of Object.entries(req.headers)) {
        const lowerKey = key.toLowerCase();
        if (!["host", "content-length", "connection"].includes(lowerKey) && val !== undefined) {
          if (Array.isArray(val)) {
            val.forEach(v => headers.append(key, v));
          } else {
            headers.set(key, val as string);
          }
        }
      }

      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_V-D0_fCyKzU2H7yL9xHtzQ_0bUrDx8u";
      if (!headers.get("apikey")) {
        headers.set("apikey", anonKey);
      }
      if (!headers.get("Authorization") && !headers.get("authorization")) {
        headers.set("Authorization", `Bearer ${anonKey}`);
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      if (!["GET", "HEAD"].includes(req.method) && req.body && Buffer.isBuffer(req.body) && req.body.length > 0) {
        fetchOptions.body = req.body;
      }

      const response = await fetch(targetUrl, fetchOptions);

      res.status(response.status);
      response.headers.forEach((val, key) => {
        const lower = key.toLowerCase();
        if (!["content-encoding", "transfer-encoding", "connection"].includes(lower)) {
          res.setHeader(key, val);
        }
      });

      const buffer = Buffer.from(await response.arrayBuffer());
      res.send(buffer);
    } catch (error) {
      console.error("Supabase proxy error:", error);
      res.status(502).json({ error: "Failed to connect to Supabase backend", details: String(error) });
    }
  });

  app.use(express.json());

  // Broadcast helper
  const broadcast = (data: any) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  };

  // API Routes
  app.get("/api/orders", (req, res) => {
    const orders = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
    res.json(orders);
  });

  app.post("/api/orders", (req, res) => {
    const { customer_name, items } = req.body;
    if (!customer_name || !items) {
      return res.status(400).json({ error: "Missing fields" });
    }
    const info = db.prepare("INSERT INTO orders (customer_name, items) VALUES (?, ?)").run(customer_name, items);
    broadcast({ type: "ORDER_CREATED", id: info.lastInsertRowid });
    res.json({ id: info.lastInsertRowid, status: "pending" });
  });

  app.patch("/api/orders/:id/ready", (req, res) => {
    const { id } = req.params;
    db.prepare("UPDATE orders SET status = 'ready', ready_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    broadcast({ type: "ORDER_READY", id: parseInt(id) });
    res.json({ success: true });
  });

  app.patch("/api/orders/:id/delivered", (req, res) => {
    const { id } = req.params;
    db.prepare("UPDATE orders SET status = 'delivered' WHERE id = ?").run(id);
    broadcast({ type: "ORDER_DELIVERED", id: parseInt(id) });
    res.json({ success: true });
  });

  // ESP32 Endpoint
  // Returns the ID of the most recent 'ready' order
  app.get("/api/esp32/status", (req, res) => {
    const lastReady = db.prepare("SELECT id FROM orders WHERE status = 'ready' ORDER BY ready_at DESC LIMIT 1").get();
    res.json({ lastReadyId: lastReady ? (lastReady as any).id : 0 });
  });

  // POST endpoint to trigger LED (kept for backwards compatibility)
  app.post("/api/esp32/trigger", (req, res) => {
    broadcast({ type: "TRIGGER_LED", timestamp: Date.now() });
    res.json({ success: true, message: "LED Trigger broadcasted" });
  });

  // Sensor / LED State for ESP32
  let ledStatus = "off";

  // ESP32 Polling Endpoint
  app.get("/api/esp32/led", (req, res) => {
    res.send(ledStatus === "on" ? "1" : "0");
  });

  // Endpoint receiving ESP32 door presence sensor POSTs: {"status": "1"} or {"status": "0"}
  app.post("/api/esp32/led", (req, res) => {
    const rawStatus = req.body?.status;
    const source = typeof req.body?.source === "string" ? req.body.source : "esp32";
    const normalized = String(rawStatus ?? "").trim().toLowerCase();

    if (normalized === "1" || normalized === "on" || normalized === "true") {
      ledStatus = "on";
      const createdAt = req.body?.created_at || new Date().toISOString();
      const info = db
        .prepare("INSERT INTO sensor_entries (status, source, created_at) VALUES (?, ?, ?)")
        .run("1", source, createdAt);
      const entry = {
        id: Number(info.lastInsertRowid),
        status: "1",
        source,
        created_at: createdAt,
      };
      broadcast({ type: "SENSOR_ENTRY", entry });
      broadcast({ type: "LED_STATUS_CHANGED", status: ledStatus });
      return res.json({ success: true, status: "1", entry });
    }

    if (normalized === "0" || normalized === "off" || normalized === "false") {
      ledStatus = "off";
      broadcast({ type: "LED_STATUS_CHANGED", status: ledStatus });
      return res.json({ success: true, status: "0" });
    }

    return res.status(400).json({ error: "Invalid status. Expected '1' or '0'." });
  });

  // Query persisted ESP32 door crossings
  app.get("/api/esp32/entries", (req, res) => {
    try {
      const { start_date, end_date } = req.query;
      let rows: any[];
      if (start_date && end_date) {
        rows = db
          .prepare("SELECT * FROM sensor_entries WHERE substr(created_at, 1, 10) >= ? AND substr(created_at, 1, 10) <= ? ORDER BY created_at DESC")
          .all(String(start_date), String(end_date));
      } else {
        rows = db
          .prepare("SELECT * FROM sensor_entries ORDER BY created_at DESC LIMIT 10000")
          .all();
      }
      res.json({ entries: rows, currentStatus: ledStatus });
    } catch (error) {
      console.error("Error fetching sensor entries:", error);
      res.status(500).json({ error: "Failed to fetch sensor entries" });
    }
  });

  // Bulk insert sample ESP32 crossings for 30-day testing
  app.post("/api/esp32/entries/sample", (req, res) => {
    try {
      const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
      if (entries.length === 0) {
        return res.status(400).json({ error: "No sample entries provided" });
      }
      const insertStmt = db.prepare("INSERT INTO sensor_entries (status, source, created_at) VALUES (?, 'sample', ?)");
      const insertMany = db.transaction((items: Array<{ status?: string; created_at: string }>) => {
        db.prepare("DELETE FROM sensor_entries WHERE source = 'sample'").run();
        for (const item of items) {
          insertStmt.run(item.status || "1", item.created_at);
        }
      });
      insertMany(entries);
      broadcast({ type: "SENSOR_SAMPLE_UPDATED" });
      res.json({ success: true, inserted: entries.length });
    } catch (error) {
      console.error("Error inserting sample entries:", error);
      res.status(500).json({ error: "Failed to insert sample entries" });
    }
  });

  // Delete only sample ESP32 crossings (keeps real ESP32 hardware logs intact)
  app.delete("/api/esp32/entries/sample", (req, res) => {
    try {
      const info = db.prepare("DELETE FROM sensor_entries WHERE source = 'sample'").run();
      broadcast({ type: "SENSOR_SAMPLE_UPDATED" });
      res.json({ success: true, deleted: info.changes });
    } catch (error) {
      console.error("Error deleting sample entries:", error);
      res.status(500).json({ error: "Failed to delete sample entries" });
    }
  });

  // Public Weather Proxy (Open-Meteo Archive + Forecast + Reverse Geocoding)
  app.get("/api/weather", async (req, res) => {
    try {
      const lat = parseFloat(String(req.query.lat ?? "-23.5505"));
      const lon = parseFloat(String(req.query.lon ?? "-46.6333"));
      const pastDays = Math.min(90, Math.max(7, parseInt(String(req.query.past_days ?? "45"), 10) || 45));
      const forecastDays = Math.min(16, Math.max(7, parseInt(String(req.query.forecast_days ?? "14"), 10) || 14));

      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: "Invalid coordinates" });
      }

      const now = new Date();
      const endArchiveDate = new Date(now);
      endArchiveDate.setDate(endArchiveDate.getDate() - 3);
      const startArchiveDate = new Date(now);
      startArchiveDate.setDate(startArchiveDate.getDate() - pastDays);

      const fmt = (d: Date) => d.toISOString().split("T")[0];

      const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weather_code&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,precipitation_probability_max,weather_code&past_days=14&forecast_days=${forecastDays}&timezone=auto`;
      const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${fmt(startArchiveDate)}&end_date=${fmt(endArchiveDate)}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,weather_code&timezone=auto`;
      const geocodeUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=pt`;

      const [forecastRes, archiveRes, geoRes] = await Promise.allSettled([
        fetch(forecastUrl),
        fetch(archiveUrl),
        fetch(geocodeUrl),
      ]);

      const dailyMap = new Map<string, any>();

      // Archive first (older days)
      if (archiveRes.status === "fulfilled" && archiveRes.value.ok) {
        const archiveJson: any = await archiveRes.value.json();
        const dates: string[] = archiveJson?.daily?.time || [];
        dates.forEach((date, i) => {
          const tMax = archiveJson.daily.temperature_2m_max?.[i];
          const tMin = archiveJson.daily.temperature_2m_min?.[i];
          const tMean = archiveJson.daily.temperature_2m_mean?.[i];
          const precip = archiveJson.daily.precipitation_sum?.[i] ?? 0;
          const code = archiveJson.daily.weather_code?.[i] ?? 0;
          if (tMax !== null && tMax !== undefined) {
            dailyMap.set(date, {
              date,
              tempMax: Number(tMax),
              tempMin: Number(tMin ?? tMax - 7),
              tempMean: Number(tMean ?? (tMax + (tMin ?? tMax - 7)) / 2),
              precipitationSum: Number(precip),
              precipitationProb: precip > 1 ? 80 : 10,
              weatherCode: Number(code),
              isForecast: false,
            });
          }
        });
      }

      // Forecast overrides recent days & adds future days
      let currentWeather: any = null;
      const todayStr = fmt(now);
      if (forecastRes.status === "fulfilled" && forecastRes.value.ok) {
        const forecastJson: any = await forecastRes.value.json();
        if (forecastJson?.current) {
          currentWeather = {
            temperature: Number(forecastJson.current.temperature_2m ?? 25),
            precipitation: Number(forecastJson.current.precipitation ?? 0),
            weatherCode: Number(forecastJson.current.weather_code ?? 0),
          };
        }
        const dates: string[] = forecastJson?.daily?.time || [];
        dates.forEach((date, i) => {
          const tMax = forecastJson.daily.temperature_2m_max?.[i];
          const tMin = forecastJson.daily.temperature_2m_min?.[i];
          const tMean = forecastJson.daily.temperature_2m_mean?.[i];
          const precip = forecastJson.daily.precipitation_sum?.[i] ?? 0;
          const prob = forecastJson.daily.precipitation_probability_max?.[i] ?? (precip > 1 ? 75 : 15);
          const code = forecastJson.daily.weather_code?.[i] ?? 0;
          if (tMax !== null && tMax !== undefined) {
            dailyMap.set(date, {
              date,
              tempMax: Number(tMax),
              tempMin: Number(tMin ?? tMax - 7),
              tempMean: Number(tMean ?? (tMax + (tMin ?? tMax - 7)) / 2),
              precipitationSum: Number(precip),
              precipitationProb: Number(prob),
              weatherCode: Number(code),
              isForecast: date > todayStr,
            });
          }
        });
      } else {
        return res.status(502).json({ error: "Não foi possível obter dados da API pública Open-Meteo" });
      }

      let cityName = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
      if (geoRes.status === "fulfilled" && geoRes.value.ok) {
        const geoJson: any = await geoRes.value.json();
        const city = geoJson?.city || geoJson?.locality || geoJson?.principalSubdivision;
        const region = geoJson?.principalSubdivisionCode || geoJson?.principalSubdivision;
        if (city) {
          cityName = region && region !== city ? `${city}, ${String(region).replace(/^BR-/, "")}` : city;
        }
      }

      const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      res.json({
        location: { lat, lon, city: cityName },
        current: currentWeather,
        daily,
      });
    } catch (error) {
      console.error("Weather proxy error:", error);
      res.status(500).json({ error: "Erro ao consultar dados climáticos" });
    }
  });

  // S3 Pre-signed URL Endpoint
  app.post("/api/storage/presigned-url", async (req, res) => {
    if (!s3Client) {
      return res.status(503).json({ error: "S3 Storage not configured on server" });
    }

    const { fileName, contentType } = req.body;
    if (!fileName) return res.status(400).json({ error: "fileName required" });

    try {
      const bucket = process.env.S3_BUCKET_NAME || "imagens";
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: fileName,
        ContentType: contentType || "image/jpeg",
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      
      // Construct the likely public URL for Supabase
      // Usually: https://project-id.supabase.co/storage/v1/object/public/bucket/file
      const publicUrl = `https://${supabaseProjectId}.supabase.co/storage/v1/object/public/${bucket}/${fileName}`;

      res.json({ uploadUrl: url, publicUrl });
    } catch (error) {
      console.error("Error generating presigned URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
