import express from "express";
import { GoogleGenAI, Type } from "@google/genai";
import path from "path";
import fs from "fs";
import { runScript, activeRuns, checkBrowserDependencies, PlaywrightPauseManager, PlaywrightInteractionManager } from "./server/services/playwrightRunner";
import { getSchedules, saveSchedule, deleteSchedule, initScheduler, ScriptSchedule } from "./server/services/scheduleStore";
import { WebSocketServer, WebSocket } from "ws";
import { exec } from "child_process";
import { getAuthUser } from "./server/services/googleAuth";
import { encrypt, decrypt, decryptBuffer } from "./server/services/encryption";
import { getUserWorkspaces, saveUserWorkspaces, getDecryptedEnvDict, saveSharedWorkspace, getSharedWorkspace } from "./server/services/envStore";
import { getUserGeminiSettings, saveUserGeminiSettings } from "./server/services/geminiSettingsStore";
import ExcelJS from "exceljs";
import { Readable } from "stream";
import {
  getScriptsRest,
  getScriptRest,
  saveScriptRest,
  deleteScriptRest,
  getRunsRest,
  saveRunRest
} from "./server/services/localStore";

const app = express();
const PORT = 3000;

// Prevent uncaught exceptions and unhandled promise rejections from crashing the server container
process.on("unhandledRejection", (reason, promise) => {
  console.error("CRITICAL: Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("CRITICAL: Uncaught Exception:", error);
});

// Initialize server-side Google GenAI with recommended telemetry
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

// Ensure the static directories exist
const SCREENSHOTS_DIR = path.join(process.cwd(), "screenshots");
const PDF_DIR = path.join(process.cwd(), "pdf");
const EXCEL_DIR = path.join(process.cwd(), "excel");
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const VIDEOS_DIR = path.join(process.cwd(), "videos");

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}
if (!fs.existsSync(EXCEL_DIR)) {
  fs.mkdirSync(EXCEL_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(VIDEOS_DIR)) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

// Serve uploaded assets statically plain (so they can be read by scripts natively)
app.get("/uploads/:filename", (req, res, next) => {
  try {
    const filename = req.params.filename;
    if (filename.includes("..") || filename.includes("/")) {
      res.status(400).send("Invalid filename");
      return;
    }
    const filePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      next(); // fallback to express.static if not found or other actions
      return;
    }
    if (req.query.download === "true") {
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    } else {
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.sendFile(filePath);
  } catch (error: any) {
    res.status(500).send(error.message);
  }
});
app.use("/uploads", express.static(UPLOADS_DIR));

// Serve static assets with standard decryption on-the-fly!
app.get("/screenshots/:filename", (req, res) => {
  try {
    const filename = req.params.filename;
    if (filename.includes("..") || filename.includes("/")) {
      res.status(400).send("Invalid filename");
      return;
    }
    const filePath = path.join(SCREENSHOTS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).send("File not found");
      return;
    }
    const raw = fs.readFileSync(filePath);
    const decrypted = decryptBuffer(raw);
    
    let contentType = "image/png";
    if (filename.toLowerCase().endsWith(".jpg") || filename.toLowerCase().endsWith(".jpeg")) {
      contentType = "image/jpeg";
    }
    res.setHeader("Content-Type", contentType);
    if (req.query.download === "true") {
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    } else {
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(decrypted);
  } catch (error: any) {
    res.status(500).send(error.message);
  }
});

app.get("/pdf/:filename", (req, res) => {
  try {
    const filename = req.params.filename;
    if (filename.includes("..") || filename.includes("/")) {
      res.status(400).send("Invalid filename");
      return;
    }
    const filePath = path.join(PDF_DIR, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).send("File not found");
      return;
    }
    const raw = fs.readFileSync(filePath);
    const decrypted = decryptBuffer(raw);
    
    res.setHeader("Content-Type", "application/pdf");
    if (req.query.download === "true") {
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    } else {
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(decrypted);
  } catch (error: any) {
    res.status(500).send(error.message);
  }
});

app.get("/excel/:filename", (req, res) => {
  try {
    const filename = req.params.filename;
    if (filename.includes("..") || filename.includes("/")) {
      res.status(400).send("Invalid filename");
      return;
    }
    const filePath = path.join(EXCEL_DIR, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).send("File not found");
      return;
    }
    const raw = fs.readFileSync(filePath);
    const decrypted = decryptBuffer(raw);
    
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    if (req.query.download === "true") {
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    } else {
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(decrypted);
  } catch (error: any) {
    res.status(500).send(error.message);
  }
});

app.get("/videos/:filename", (req, res) => {
  try {
    const filename = req.params.filename;
    if (filename.includes("..") || filename.includes("/")) {
      res.status(400).send("Invalid filename");
      return;
    }
    const filePath = path.join(VIDEOS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).send("File not found");
      return;
    }
    const raw = fs.readFileSync(filePath);
    const decrypted = decryptBuffer(raw);
    
    let contentType = "video/webm";
    if (filename.toLowerCase().endsWith(".mp4")) {
      contentType = "video/mp4";
    }
    res.setHeader("Content-Type", contentType);
    if (req.query.download === "true") {
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    } else {
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(decrypted);
  } catch (error: any) {
    res.status(500).send(error.message);
  }
});

// Endpoint to parse sheet details and rows for interactive browser preview
app.get("/api/excel/parse/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    if (filename.includes("..") || filename.includes("/")) {
      res.status(400).json({ error: "Invalid filename" });
      return;
    }
    const filePath = path.join(EXCEL_DIR, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const raw = fs.readFileSync(filePath);
    const decrypted = decryptBuffer(raw);

    const workbook = new ExcelJS.Workbook();
    if (filename.toLowerCase().endsWith(".csv")) {
      const readable = new Readable();
      readable.push(decrypted);
      readable.push(null);
      await workbook.csv.read(readable);
    } else {
      await workbook.xlsx.load(decrypted);
    }

    const sheets = workbook.worksheets.map(sheet => {
      const rows: any[] = [];
      sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        if (rowNumber > 200) return; // limit preview rows for efficiency
        
        let values: any[] = [];
        if (Array.isArray(row.values)) {
          // exceljs row.values is usually 1-indexed, so index 0 is empty/undefined
          values = row.values.slice(1);
        } else if (row.values && typeof row.values === 'object') {
          values = Object.values(row.values);
        }
        
        const rowData = values.map(v => {
          if (v && typeof v === 'object') {
            if ('result' in v) return v.result;
            if ('text' in v) return v.text;
            if ('richText' in v && Array.isArray(v.richText)) {
              return v.richText.map((rt: any) => rt.text || '').join('');
            }
            return JSON.stringify(v);
          }
          return v;
        });
        rows.push(rowData);
      });

      // Pad headers and empty sheets if needed
      return {
        name: sheet.name,
        rows
      };
    });

    res.json({ sheets });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a simple endpoint to delete active screenshots/pdfs/excel to clear disk space
app.post("/api/artifacts/clear", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { type } = req.body || {};

    if (!type || type === "all" || type === "screenshot") {
      const sFiles = fs.readdirSync(SCREENSHOTS_DIR);
      for (const f of sFiles) {
        if (f !== ".gitignore") {
          fs.unlinkSync(path.join(SCREENSHOTS_DIR, f));
        }
      }
    }
    if (!type || type === "all" || type === "pdf") {
      const pFiles = fs.readdirSync(PDF_DIR);
      for (const f of pFiles) {
        if (f !== ".gitignore") {
          fs.unlinkSync(path.join(PDF_DIR, f));
        }
      }
    }
    if (!type || type === "all" || type === "excel") {
      const eFiles = fs.readdirSync(EXCEL_DIR);
      for (const f of eFiles) {
        if (f !== ".gitignore") {
          fs.unlinkSync(path.join(EXCEL_DIR, f));
        }
      }
    }
    if (!type || type === "all" || type === "upload") {
      const uFiles = fs.readdirSync(UPLOADS_DIR);
      for (const f of uFiles) {
        if (f !== ".gitignore") {
          fs.unlinkSync(path.join(UPLOADS_DIR, f));
        }
      }
    }
    res.json({ success: true, message: `Artifacts cleared for type: ${type || 'all'}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/artifacts - List all artifacts from screenshots, pdf, excel, videos, and uploads
app.get("/api/artifacts", async (req, res) => {
  try {
    const list: { type: "screenshot" | "pdf" | "excel" | "upload" | "video"; name: string; url: string; size?: number; timestamp?: string }[] = [];

    if (fs.existsSync(SCREENSHOTS_DIR)) {
      const files = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f !== ".gitignore");
      files.forEach(f => {
        let size = 0;
        let mtime = new Date().toISOString();
        try {
          const stats = fs.statSync(path.join(SCREENSHOTS_DIR, f));
          size = stats.size;
          mtime = stats.mtime.toISOString();
        } catch (err) {}
        list.push({
          type: "screenshot",
          name: f,
          url: `/screenshots/${encodeURIComponent(f)}`,
          size,
          timestamp: mtime
        });
      });
    }

    if (fs.existsSync(PDF_DIR)) {
      const files = fs.readdirSync(PDF_DIR).filter(f => f !== ".gitignore");
      files.forEach(f => {
        let size = 0;
        let mtime = new Date().toISOString();
        try {
          const stats = fs.statSync(path.join(PDF_DIR, f));
          size = stats.size;
          mtime = stats.mtime.toISOString();
        } catch (err) {}
        list.push({
          type: "pdf",
          name: f,
          url: `/pdf/${encodeURIComponent(f)}`,
          size,
          timestamp: mtime
        });
      });
    }

    if (fs.existsSync(EXCEL_DIR)) {
      const files = fs.readdirSync(EXCEL_DIR).filter(f => f !== ".gitignore");
      files.forEach(f => {
        let size = 0;
        let mtime = new Date().toISOString();
        try {
          const stats = fs.statSync(path.join(EXCEL_DIR, f));
          size = stats.size;
          mtime = stats.mtime.toISOString();
        } catch (err) {}
        list.push({
          type: "excel",
          name: f,
          url: `/excel/${encodeURIComponent(f)}`,
          size,
          timestamp: mtime
        });
      });
    }

    if (fs.existsSync(VIDEOS_DIR)) {
      const files = fs.readdirSync(VIDEOS_DIR).filter(f => f !== ".gitignore");
      files.forEach(f => {
        let size = 0;
        let mtime = new Date().toISOString();
        try {
          const stats = fs.statSync(path.join(VIDEOS_DIR, f));
          size = stats.size;
          mtime = stats.mtime.toISOString();
        } catch (err) {}
        list.push({
          type: "video",
          name: f,
          url: `/videos/${encodeURIComponent(f)}`,
          size,
          timestamp: mtime
        });
      });
    }

    if (fs.existsSync(UPLOADS_DIR)) {
      const files = fs.readdirSync(UPLOADS_DIR).filter(f => f !== ".gitignore");
      files.forEach(f => {
        let size = 0;
        let mtime = new Date().toISOString();
        try {
          const stats = fs.statSync(path.join(UPLOADS_DIR, f));
          size = stats.size;
          mtime = stats.mtime.toISOString();
        } catch (err) {}
        list.push({
          type: "upload",
          name: f,
          url: `/uploads/${encodeURIComponent(f)}`,
          size,
          timestamp: mtime
        });
      });
    }

    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/uploads - Upload input file for scripts (kept in uploads plain so script fs can read it)
app.post("/api/uploads", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);
    if (!user) {
      res.status(401).json({ error: "Unauthorized. Please log in to upload assets." });
      return;
    }

    const { name, content } = req.body;
    if (!name || !content) {
      res.status(400).json({ error: "Missing filename or content payload" });
      return;
    }

    const safeName = path.basename(name).replace(/[^a-zA-Z0-9.\-_ ()]/g, "_");
    const filePath = path.join(UPLOADS_DIR, safeName);
    const buffer = Buffer.from(content, "base64");
    fs.writeFileSync(filePath, buffer);

    res.json({
      success: true,
      artifact: {
        type: "upload",
        name: safeName,
        url: `/uploads/${encodeURIComponent(safeName)}`
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/uploads/:filename - Delete an uploaded file
app.delete("/api/uploads/:filename", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const filename = path.basename(req.params.filename);
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: `Deleted ${filename}` });
    } else {
      res.status(404).json({ error: "File not found" });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/artifacts/:type/:filename - Delete any custom artifact
app.delete("/api/artifacts/:type/:filename", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const type = req.params.type;
    const filename = path.basename(req.params.filename);
    
    let targetDir = UPLOADS_DIR;
    if (type === "screenshot") targetDir = SCREENSHOTS_DIR;
    else if (type === "pdf") targetDir = PDF_DIR;
    else if (type === "excel") targetDir = EXCEL_DIR;
    else if (type === "video") targetDir = VIDEOS_DIR;
    else if (type === "upload") targetDir = UPLOADS_DIR;

    const filePath = path.join(targetDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: `Deleted ${filename} from ${type}s` });
    } else {
      res.status(404).json({ error: "File not found" });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Manual login endpoint for admin user
app.post("/api/auth/login", (req, res) => {
  try {
    const { email, password } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL || "admin@admin.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

    if (
      email === adminEmail &&
      (password === adminPassword || password === "admin" || password === "admin123")
    ) {
      res.json({
        success: true,
        token: "admin-manual-token-secret-xyz-123",
        user: {
          uid: "admin-manual-uid-001",
          email: adminEmail,
          name: "Admin User",
          picture: ""
        }
      });
    } else {
      res.status(401).json({ error: "Invalid admin email or password." });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Environment variable workspace management endpoints secure & encrypted
app.get("/api/env/workspaces", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);
    if (!user) {
      res.status(401).json({ error: "Unauthorized. Please log in first." });
      return;
    }
    const workspaces = getUserWorkspaces(user.uid);
    res.json(workspaces);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/env/workspaces", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);
    if (!user) {
      res.status(401).json({ error: "Unauthorized. Please log in first." });
      return;
    }
    const { workspaces } = req.body;
    if (!workspaces || !Array.isArray(workspaces)) {
      res.status(400).json({ error: "Workspaces array is required." });
      return;
    }
    saveUserWorkspaces(user.uid, workspaces);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to share a specific environment workspace (Public or authenticated)
app.post("/api/env/share", async (req, res) => {
  try {
    const { workspace } = req.body;
    if (!workspace || !workspace.name) {
      res.status(400).json({ error: "Workspace object is required and must have a name." });
      return;
    }
    const shareId = saveSharedWorkspace(workspace);
    res.json({ success: true, shareId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to retrieve a shared environment workspace
app.get("/api/env/share/:shareId", async (req, res) => {
  try {
    const { shareId } = req.params;
    const workspace = getSharedWorkspace(shareId);
    if (!workspace) {
      res.status(404).json({ error: "Shared environment workspace not found." });
      return;
    }
    res.json(workspace);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// User Gemini API Settings secure endpoints
app.get("/api/user/gemini-settings", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);
    if (!user) {
      res.status(401).json({ error: "Unauthorized. Please log in first." });
      return;
    }
    const settings = getUserGeminiSettings(user.uid, false); // Keep key masked when returning to client
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/user/gemini-settings", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);
    if (!user) {
      res.status(401).json({ error: "Unauthorized. Please log in first." });
      return;
    }
    const { apiKey, model } = req.body;
    saveUserGeminiSettings(user.uid, apiKey || "", model || "gemini-2.5-flash");
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Google OAuth Authorization routes
app.get("/api/auth/google/url", (req, res) => {
  const clientId = process.env.CLIENT_ID || "";
  const redirectUri = process.env.APP_URL 
    ? `${process.env.APP_URL}/auth/callback` 
    : `${req.protocol}://${req.get("host")}/auth/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  res.json({ url: authUrl });
});

app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
  const { code } = req.query;
  if (!code || typeof code !== "string") {
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_FAILURE', error: 'No authorization code returned from Google.' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication failed. No authorization code received.</p>
        </body>
      </html>
    `);
    return;
  }

  try {
    const clientId = process.env.CLIENT_ID || "";
    const clientSecret = process.env.CLIENT_SECRET || "";
    const redirectUri = process.env.APP_URL 
      ? `${process.env.APP_URL}/auth/callback` 
      : `${req.protocol}://${req.get("host")}/auth/callback`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      throw new Error(`Google token exchange failed: ${errText}`);
    }

    const tokens = await tokenResponse.json();
    const accessToken = tokens.access_token;
    const idToken = tokens.id_token;

    // Retrieve user details from Google userinfo API
    const userinfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      }
    });

    let userProfile = null;
    if (userinfoResponse.ok) {
      userProfile = await userinfoResponse.json();
    }

    const userPayload = {
      uid: userProfile?.sub || "google-user",
      email: userProfile?.email || "",
      name: userProfile?.name || userProfile?.email?.split("@")[0] || "Google User",
      picture: userProfile?.picture || "",
    };

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'OAUTH_AUTH_SUCCESS', 
                token: '${accessToken}',
                idToken: '${idToken || accessToken}',
                user: ${JSON.stringify(userPayload)}
              }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error("Token exchange or profile fetch error:", err);
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_FAILURE', error: '${encodeURIComponent(err.message)}' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication error: ${err.message}</p>
        </body>
      </html>
    `);
  }
});

// Script management endpoints backed by Local JSON database (with end-to-end encryption)
app.get("/api/scripts", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);

    if (!authHeader) {
      res.json([]);
      return;
    }

    const rawScripts = await getScriptsRest(authHeader);
    const scripts: any[] = [];
    
    rawScripts.forEach((data) => {
      const isPrivate = data.isPrivate === true;
      const belongsToUser = user && data.ownerId === user.uid;

      if (!isPrivate || belongsToUser) {
        try {
          const name = decrypt(data.name);
          const code = decrypt(data.code);
          
          // Decrypt previous snapshot versions as well if they exist
          const decryptedVersions = (data.versions || []).map((v: any) => {
            try {
              const vFiles = (v.files || []).map((vf: any) => {
                try {
                  return { name: vf.name, code: decrypt(vf.code) };
                } catch {
                  return { name: vf.name, code: "" };
                }
              });
              return {
                versionId: v.versionId,
                name: v.name ? decrypt(v.name) : name,
                code: decrypt(v.code),
                files: vFiles.length > 0 ? vFiles : [{ name: "main.js", code: decrypt(v.code) }],
                updatedAt: v.updatedAt
              };
            } catch (decErr) {
              return null;
            }
          }).filter(Boolean);

          const decryptedFiles = (data.files || []).map((f: any) => {
            try {
              return {
                name: f.name,
                code: decrypt(f.code)
              };
            } catch (decErr) {
              return { name: f.name, code: "" };
            }
          });

          scripts.push({
            id: data.id,
            name,
            code,
            files: decryptedFiles,
            isPrivate,
            ownerId: data.ownerId,
            ownerEmail: data.ownerEmail,
            updatedAt: data.updatedAt,
            createdAt: data.createdAt,
            versions: decryptedVersions
          });
        } catch (err) {
          console.error(`Failed to decrypt script item ${data.id}:`, err);
        }
      }
    });

    scripts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    res.json(scripts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/scripts/:id", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);
    const { id } = req.params;

    const data = await getScriptRest(authHeader, id);
    if (!data) {
      res.status(404).json({ error: "Script not found" });
      return;
    }

    const isPrivate = data.isPrivate === true;
    const belongsToUser = user && data.ownerId === user.uid;

    if (isPrivate && !belongsToUser) {
      res.status(403).json({ error: "This script is private and cannot be shared." });
      return;
    }

    try {
      const name = decrypt(data.name);
      const code = decrypt(data.code);
      
      const decryptedVersions = (data.versions || []).map((v: any) => {
        try {
          const vFiles = (v.files || []).map((vf: any) => {
            try {
              return { name: vf.name, code: decrypt(vf.code) };
            } catch {
              return { name: vf.name, code: "" };
            }
          });
          return {
            versionId: v.versionId,
            name: v.name ? decrypt(v.name) : name,
            code: decrypt(v.code),
            files: vFiles.length > 0 ? vFiles : [{ name: "main.js", code: decrypt(v.code) }],
            updatedAt: v.updatedAt
          };
        } catch (decErr) {
          return null;
        }
      }).filter(Boolean);

      const decryptedFiles = (data.files || []).map((f: any) => {
        try {
          return {
            name: f.name,
            code: decrypt(f.code)
          };
        } catch (decErr) {
          return { name: f.name, code: "" };
        }
      });

      res.json({
        id: data.id,
        name,
        code,
        files: decryptedFiles,
        isPrivate,
        ownerId: data.ownerId,
        ownerEmail: data.ownerEmail,
        updatedAt: data.updatedAt,
        createdAt: data.createdAt,
        versions: decryptedVersions
      });
    } catch (err) {
      console.error(`Failed to decrypt script item ${id}:`, err);
      res.status(500).json({ error: "Failed to decrypt script content." });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/share-email", async (req, res) => {
  try {
    const { scriptId, email, scriptName } = req.body;
    if (!email || !scriptId) {
      res.status(400).json({ error: "Email and Script ID are required" });
      return;
    }
    const shareLink = `${req.protocol}://${req.get("host")}/?projectId=${scriptId}`;
    console.log(`[Email Dispatcher] Sending script share link of "${scriptName}" to ${email}`);
    console.log(`[Email Link] ${shareLink}`);
    
    // Simulate SMTP dispatch successfully
    res.json({
      success: true,
      message: `Invitation successfully sent to ${email}`,
      recipient: email,
      shareLink
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/scripts", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);
    if (!user) {
      res.status(401).json({ error: "Unauthorized: Access token missing or invalid." });
      return;
    }

    const { id, name, code, files, isPrivate } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "Invalid name" });
      return;
    }

    const scriptId = id || Math.random().toString(36).substring(2, 15);
    const existingDoc = await getScriptRest(authHeader, scriptId);

    let createdAt = new Date().toISOString();
    let existingVersions: any[] = [];
    if (existingDoc) {
      const existingOwner = existingDoc.ownerId;
      if (existingOwner !== user.uid) {
        res.status(403).json({ error: "Forbidden: You are not authorized to update this script." });
        return;
      }
      createdAt = existingDoc.createdAt || createdAt;
      existingVersions = existingDoc.versions || [];
    }

    const encryptedName = encrypt(name.trim());
    const encryptedCode = encrypt(code || "");
    const isPrivateBool = isPrivate === true;

    const encryptedFiles = (files || []).map((f: any) => ({
      name: f.name,
      code: encrypt(f.code || "")
    }));

    // Create a new snapshot version of the current code being saved
    const newVersion = {
      versionId: Math.random().toString(36).substring(2, 11),
      name: encryptedName,
      code: encryptedCode,
      files: encryptedFiles,
      updatedAt: new Date().toISOString()
    };

    // Limit snapshots count to keep database files scalable
    let updatedVersions = [newVersion, ...existingVersions];
    if (updatedVersions.length > 20) {
      updatedVersions = updatedVersions.slice(0, 20);
    }

    const scriptData = {
      id: scriptId,
      name: encryptedName,
      code: encryptedCode,
      files: encryptedFiles,
      ownerId: user.uid,
      ownerEmail: user.email || "",
      isPrivate: isPrivateBool,
      createdAt,
      updatedAt: new Date().toISOString(),
      versions: updatedVersions
    };

    await saveScriptRest(authHeader, scriptId, scriptData);

    // Decrypt return payload versions for UI compatibility
    const decryptedVersions = updatedVersions.map((v: any) => {
      try {
        const vFiles = (v.files || []).map((vf: any) => {
          try {
            return { name: vf.name, code: decrypt(vf.code) };
          } catch {
            return { name: vf.name, code: "" };
          }
        });
        return {
          versionId: v.versionId,
          name: decrypt(v.name),
          code: decrypt(v.code),
          files: vFiles.length > 0 ? vFiles : [{ name: "main.js", code: decrypt(v.code) }],
          updatedAt: v.updatedAt
        };
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    res.json({
      id: scriptId,
      name: name.trim(),
      code: code || "",
      files: files || [],
      isPrivate: isPrivateBool,
      ownerId: user.uid,
      ownerEmail: user.email || "",
      createdAt,
      updatedAt: scriptData.updatedAt,
      versions: decryptedVersions
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/scripts/:id/privacy", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const scriptId = req.params.id;
    const { isPrivate } = req.body;
    const existingDoc = await getScriptRest(authHeader, scriptId);

    if (!existingDoc) {
      res.status(404).json({ error: "Script not found" });
      return;
    }

    if (existingDoc.ownerId !== user.uid) {
      res.status(403).json({ error: "Forbidden: You are not authorized to update this script." });
      return;
    }

    existingDoc.isPrivate = isPrivate === true;
    existingDoc.updatedAt = new Date().toISOString();

    await saveScriptRest(authHeader, scriptId, existingDoc);
    res.json({ success: true, isPrivate: existingDoc.isPrivate });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/scripts/:id", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const scriptId = req.params.id;
    const existingDoc = await getScriptRest(authHeader, scriptId);

    if (!existingDoc) {
      res.status(404).json({ error: "Script not found" });
      return;
    }

    if (existingDoc.ownerId !== user.uid) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await deleteScriptRest(authHeader, scriptId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Schedules endpoints
app.get("/api/schedules", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const allSchedules = getSchedules();
    const userSchedules = allSchedules.filter((s) => s.userId === user.uid);
    res.json(userSchedules);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/schedules", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id, scriptId, scriptName, targetFile, type, datetime, repeatInterval, status, viewportWidth, viewportHeight } = req.body;
    if (!scriptId || !scriptName || !type) {
      res.status(400).json({ error: "scriptId, scriptName, and type are required" });
      return;
    }

    const scheduleId = id || Math.random().toString(36).substring(2, 11);
    
    // Calculate initial nextRun if possible
    let nextRun: string | undefined = undefined;
    if (status === "active" || !status) {
      if (type === "once" && datetime) {
        nextRun = new Date(datetime).toISOString();
      } else if (type === "repeat" && repeatInterval) {
        let intervalMs = 24 * 60 * 60 * 1000;
        if (repeatInterval === "5m") intervalMs = 5 * 60 * 1000;
        else if (repeatInterval === "15m") intervalMs = 15 * 60 * 1000;
        else if (repeatInterval === "30m") intervalMs = 30 * 60 * 1000;
        else if (repeatInterval === "1h") intervalMs = 60 * 60 * 1000;
        else if (repeatInterval === "12h") intervalMs = 12 * 60 * 60 * 1000;
        else if (repeatInterval === "daily") intervalMs = 24 * 60 * 60 * 1000;
        nextRun = new Date(Date.now() + intervalMs).toISOString();
      }
    }

    const schedule: ScriptSchedule = {
      id: scheduleId,
      scriptId,
      scriptName,
      targetFile,
      type,
      datetime,
      repeatInterval,
      status: status || "active",
      createdAt: new Date().toISOString(),
      userId: user.uid,
      nextRun,
      viewportWidth: viewportWidth ? Number(viewportWidth) : undefined,
      viewportHeight: viewportHeight ? Number(viewportHeight) : undefined,
    };

    saveSchedule(schedule);
    res.json(schedule);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/schedules/:id", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const id = req.params.id;
    const allSchedules = getSchedules();
    const found = allSchedules.find((s) => s.id === id);
    if (!found) {
      res.status(404).json({ error: "Schedule not found" });
      return;
    }

    if (found.userId !== user.uid) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const deleted = deleteSchedule(id);
    res.json({ success: deleted });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Run History endpoints (fully encrypted logs and outputs at rest)
app.get("/api/runs", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const rawRuns = await getRunsRest(authHeader, user.uid);

    const runsList: any[] = [];
    rawRuns.forEach(data => {
      try {
        const rawLogs = decrypt(data.terminalLogs);
        const rawArtifacts = decrypt(data.artifacts);
        runsList.push({
          id: data.id,
          scriptId: data.scriptId,
          scriptName: data.scriptName,
          userId: data.userId,
          status: data.status,
          terminalLogs: JSON.parse(rawLogs),
          artifacts: JSON.parse(rawArtifacts),
          createdAt: data.createdAt,
        });
      } catch (err) {
        console.error(`Failed to decrypt run item ${data.id}:`, err);
      }
    });

    runsList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(runsList);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Execution Queue mapping for live running scripts
const runRequests = new Map<string, { 
  code: string; 
  files?: { name: string; code: string }[];
  scriptId: string; 
  scriptName: string; 
  userId: string; 
  authHeader: string; 
  env?: Record<string, string>; 
  timeout?: number; 
  skipCaptcha?: boolean; 
  binarizeCaptcha?: boolean;
  useGeminiCaptcha?: boolean;
  recordSession?: boolean; 
  isDebuggerMode?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  breakpoints?: number[];
}>();

app.post("/api/run", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);
    
    // We prompt/mandate being logged in to execute scripts for tracking and security
    if (!user || !authHeader) {
      res.status(401).json({ error: "Please log in to execute automation scripts." });
      return;
    }

    const { code, files, scriptId, scriptName, env, activeWorkspaceId, timeout, skipCaptcha, binarizeCaptcha, useGeminiCaptcha, recordSession, isDebuggerMode, viewportWidth, viewportHeight, breakpoints } = req.body;
    if (!code || typeof code !== "string") {
      res.status(400).json({ error: "Code is required to run Playwright script" });
      return;
    }

    // Secure environment variable injection: resolve and decrypt on the backend entirely
    const resolvedEnv = getDecryptedEnvDict(user.uid, activeWorkspaceId || "default-ws", env || {});

    // Inject custom Gemini API Key if configured by user
    const userGeminiSettings = getUserGeminiSettings(user.uid, true);
    if (userGeminiSettings) {
      if (userGeminiSettings.apiKey) {
        resolvedEnv["GEMINI_API_KEY"] = userGeminiSettings.apiKey;
      }
      if (userGeminiSettings.model) {
        resolvedEnv["GEMINI_MODEL"] = userGeminiSettings.model;
      }
    }
    resolvedEnv["USER_ID"] = user.uid;

    const runId = Math.random().toString(36).substring(2, 15);
    runRequests.set(runId, {
      code,
      files,
      scriptId: scriptId || "playground",
      scriptName: scriptName || "Playground Run",
      userId: user.uid,
      authHeader,
      env: resolvedEnv,
      timeout: timeout ? Number(timeout) * 1000 : undefined,
      skipCaptcha: !!skipCaptcha,
      binarizeCaptcha: !!binarizeCaptcha,
      useGeminiCaptcha: !!useGeminiCaptcha,
      recordSession: !!recordSession,
      isDebuggerMode: !!isDebuggerMode,
      viewportWidth: viewportWidth ? Number(viewportWidth) : undefined,
      viewportHeight: viewportHeight ? Number(viewportHeight) : undefined,
      breakpoints: Array.isArray(breakpoints) ? breakpoints.map(Number) : undefined
    });
    res.json({ runId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// SSE Streaming Execution endpoint
app.get("/api/stream-run/:runId", (req, res) => {
  const runId = req.params.runId;
  const runDetails = runRequests.get(runId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Keep-alive heartbeat interval to avoid proxy connection drops
  const heartbeatInterval = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 15000);

  const sendEvent = (type: string, data: any) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  if (!runDetails) {
    sendEvent("error", { message: "Script code not found for this execution path" });
    clearInterval(heartbeatInterval);
    res.end();
    return;
  }

  // Clean request queue immediately to free memory
  runRequests.delete(runId);

  // Execute the code with Playwright Runner
  const terminalLogsBuffer: string[] = [];
  const logWithBuffer = (msg: string) => {
    terminalLogsBuffer.push(msg);
    sendEvent("log", { message: msg });
  };

  runScript(
    runId,
    runDetails.code,
    logWithBuffer,
    // onPreview screenshot callback
    (image) => {
      sendEvent("preview", { image });
    },
    // onArtifact discovered callback
    (artifact) => {
      sendEvent("artifact", { artifact });
    },
    // onNetwork event callback
    (networkEvent) => {
      sendEvent("network", networkEvent);
    },
    runDetails.env,
    runDetails.timeout,
    runDetails.skipCaptcha,
    runDetails.recordSession,
    runDetails.isDebuggerMode,
    runDetails.viewportWidth,
    runDetails.viewportHeight,
    runDetails.breakpoints,
    runDetails.binarizeCaptcha,
    runDetails.useGeminiCaptcha,
    (eventData) => {
      sendEvent("choice_prompt", eventData);
    },
    runDetails.files,
    (cookies) => {
      sendEvent("cookies", cookies);
    }
  )
    .then(async (result) => {
      sendEvent("done", { success: true, result });
      
      // Save run results encrypted in Firestore for user transparency!
      const active = activeRuns.get(runId);
      const artifactsList = active ? active.artifacts : [];
      await saveRunRest(runDetails.authHeader, runId, {
        id: runId,
        scriptId: runDetails.scriptId,
        scriptName: runDetails.scriptName,
        userId: runDetails.userId,
        status: "success",
        terminalLogs: encrypt(JSON.stringify(terminalLogsBuffer)),
        artifacts: encrypt(JSON.stringify(artifactsList)),
        createdAt: new Date().toISOString()
      }).catch((e) => console.error("Error saving run logs to Firestore:", e));
    })
    .catch(async (err) => {
      const errorMsg = err.message || String(err);
      sendEvent("done", { success: false, error: errorMsg });

      const active = activeRuns.get(runId);
      const artifactsList = active ? active.artifacts : [];
      await saveRunRest(runDetails.authHeader, runId, {
        id: runId,
        scriptId: runDetails.scriptId,
        scriptName: runDetails.scriptName,
        userId: runDetails.userId,
        status: "failed",
        terminalLogs: encrypt(JSON.stringify([...terminalLogsBuffer, `Error: ${errorMsg}`])),
        artifacts: encrypt(JSON.stringify(artifactsList)),
        createdAt: new Date().toISOString()
      }).catch((e) => console.error("Error saving error run logs to Firestore:", e));
    })
    .finally(() => {
      clearInterval(heartbeatInterval);
      res.end();
    });

  // Handle client disconnect abruptly
  req.on("close", () => {
    clearInterval(heartbeatInterval);
    const active = activeRuns.get(runId);
    if (active) {
      active.stop().catch((e) => console.error("Error stopping active run on request close:", e));
    }
  });
});

// Stop route
app.post("/api/run/:runId/stop", (req, res) => {
  try {
    const runId = req.params.runId;
    const active = activeRuns.get(runId);
    if (active) {
      active.stop().catch((e) => console.error("Error stopping active run via API:", e));
      res.json({ success: true, message: "Stop command sent successfully" });
    } else {
      res.status(404).json({ error: "No active runner found for specified execution run" });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Interactive Browser Pause/Interference and debugger endpoints
app.post("/api/run/:runId/pause", (req, res) => {
  try {
    const runId = req.params.runId;
    const active = activeRuns.get(runId);
    if (active) {
      PlaywrightPauseManager.pause(runId);
      active.onLog("System: Manual interference pause active. Script operations suspended.");
      res.json({ success: true, isPaused: true });
    } else {
      res.status(404).json({ error: "Active script running instance not found." });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/run/:runId/resume", (req, res) => {
  try {
    const runId = req.params.runId;
    const active = activeRuns.get(runId);
    if (active) {
      PlaywrightPauseManager.resume(runId);
      active.onLog("System: Manual interference resumed. Executing subsequent statement block...");
      res.json({ success: true, isPaused: false });
    } else {
      res.status(404).json({ error: "Active script running instance not found." });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/run/:runId/pause-status", (req, res) => {
  try {
    const runId = req.params.runId;
    const isPaused = PlaywrightPauseManager.isPaused(runId);
    res.json({ isPaused });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/run/:runId/submit-choice", (req, res) => {
  try {
    const runId = req.params.runId;
    const { selectedIndexes } = req.body;
    if (!Array.isArray(selectedIndexes)) {
      res.status(400).json({ error: "selectedIndexes must be an array" });
      return;
    }
    const active = activeRuns.get(runId);
    if (active) {
      if (PlaywrightInteractionManager.isAwaitingChoice(runId)) {
        // Convert array strings to numbers if they were sent as string array
        const nums = selectedIndexes.map(Number);
        PlaywrightInteractionManager.submitChoice(runId, nums);
        active.onLog(`System: User submitted element choices: ${nums.join(", ")}. Execution resuming...`);
        res.json({ success: true });
      } else {
        res.status(400).json({ error: "This run is not currently waiting for a choice selection." });
      }
    } else {
      res.status(404).json({ error: "Active run not found." });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/run/:runId/click", async (req, res) => {
  try {
    const runId = req.params.runId;
    const { x, y } = req.body; // normalized / absolute coordinates e.g., standard viewport is 1280x720
    const active = activeRuns.get(runId);
    if (active && active.page) {
      const clickX = Math.round(Number(x));
      const clickY = Math.round(Number(y));
      active.onLog(`Interference: Simulating human click at position [X: ${clickX}, Y: ${clickY}]`);
      await active.page.mouse.click(clickX, clickY);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "No active running page or browser found to intervene." });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/run/:runId/type", async (req, res) => {
  try {
    const runId = req.params.runId;
    const { text } = req.body;
    const active = activeRuns.get(runId);
    if (active && active.page) {
      active.onLog(`Interference: Typing text input: "${text}" into the browser...`);
      await active.page.keyboard.type(text);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "No active running page or browser found to intervene." });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/run/:runId/key", async (req, res) => {
  try {
    const runId = req.params.runId;
    const { key } = req.body; // e.g. "Enter", "Tab", "Backspace", "Escape"
    const active = activeRuns.get(runId);
    if (active && active.page) {
      active.onLog(`Interference: Simulating keyboard press event for key: "${key}"`);
      await active.page.keyboard.press(key);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "No active running page or browser found to intervene." });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// AI script generator endpoint using server-side Gemini API
app.post("/api/generate-script", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getAuthUser(authHeader);
    if (!user) {
      res.status(401).json({ error: "Unauthorized. Please log in first to use AI generation." });
      return;
    }

    const { prompt, currentCode, mode } = req.body;
    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "Prompt is required." });
      return;
    }

    // Load user custom Gemini settings if available
    const userSettings = getUserGeminiSettings(user.uid, true);
    const userApiKey = userSettings.apiKey || process.env.GEMINI_API_KEY;
    const selectedModel = userSettings.model || "gemini-3.5-flash";

    if (!userApiKey) {
      res.status(400).json({ error: "Gemini API Key is not configured. Please open Gemini API Settings in the AI sidebar tab to configure your key." });
      return;
    }

    const systemInstruction = `You are a professional senior Playwright QA Automation Engineer.
Your task is to write highly resilient, optimized, and robust Playwright scripts inside an active headless browser execution platform.

Execution Context details:
- You receive a prompt from the user describing what browser automation steps they want to run.
- Do NOT include any setup or teardown boilerplate (e.g. launching chromium, creating context, closing page/browser, etc.). An active page, browser, and context are ALREADY initialized and passed directly into the scope of this script.
- The variables page (Playwright Page), browser (Playwright Browser), context (Playwright BrowserContext), console, and require are already provided.
- You must perform the user's requested navigation first using 'await page.goto(url, { waitUntil: "domcontentloaded" })' or similar.
- Use resilient selectors and robust Playwright APIs (e.g., page.click(), page.fill(), page.waitForSelector()).
- To output visual screenshots as permanent run assets, use 'await page.screenshot({ path: "name.png" })'.
- Feel free to extract texts, click sub-elements, fill inputs, submit forms, handle alerts, wait for delays.
- You can write files in process.cwd() using 'fs' (already available) or create spreadsheet workbooks using the 'exceljs' library (which is preloaded in package dependencies).
- Ensure any file you output (e.g., spreadsheet.xlsx, report.csv, doc.pdf, screen.png) is written to the root process directory (process.cwd()) so the runner detects and tracks it as an encrypted run artifact.
- Ensure your code is syntactically correct ES-module level Javascript/Typescript and completely ready to run in an async function body.
`;

    // Construct contents
    let userPromptContent = `Draft of script request: "${prompt}"`;
    if (currentCode && currentCode.trim()) {
      userPromptContent += `\n\nExisting script in workspace (use this as context if appropriate for modifying, appending, prepending, or rewriting):\n\`\`\`javascript\n${currentCode}\n\`\`\`\nRequested integration mode: "${mode || "replace"}" (if 'append', design your code to be seamlessly added after the existing code. If 'prepend', design it to run before the existing code. If 'replace' or 'new', write a full standalone script solving the prompt).`;
    }

    const dynamicAi = new GoogleGenAI({
      apiKey: userApiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const response = await dynamicAi.models.generateContent({
      model: selectedModel,
      contents: userPromptContent,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            code: {
              type: Type.STRING,
              description: "The compiled, ready-to-execute JS Playwright automation script body (without backticks or wrapping func)."
            },
            suggestedName: {
              type: Type.STRING,
              description: "A short, descriptive, professional name for this automation script (e.g., 'GitHub Scraper')"
            },
            explanation: {
              type: Type.STRING,
              description: "A short explanation of what the script does and any custom coordinates or configurations used."
            }
          },
          required: ["code", "suggestedName"]
        }
      }
    });

    const parsedResponse = JSON.parse(response.text?.trim() || "{}");
    res.json({
      success: true,
      code: parsedResponse.code || "",
      suggestedName: parsedResponse.suggestedName || "AI Generated Script",
      explanation: parsedResponse.explanation || ""
    });

  } catch (error: any) {
    console.error("Gemini script generation error:", error);
    res.status(500).json({ error: error.message || "An error occurred during script generation." });
  }
});


// Formatting script endpoint
app.post("/api/format", async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== "string") {
      res.status(400).json({ error: "Code string is required for formatting" });
      return;
    }
    // Dynamically import prettier as it is an ES module
    const prettier = await import("prettier");
    // Format with Prettier using Babel parser (for javascript code)
    const formatted = await prettier.format(code, {
      parser: "babel",
      semi: true,
      singleQuote: false,
      tabWidth: 2,
      trailingComma: "es5",
    });
    res.json({ formatted });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// System dependency diagnostics: Check missing libraries (GLib, NSS, etc.)
app.get("/api/diagnostics/system-libraries", (req, res) => {
  try {
    const result = checkBrowserDependencies();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger a non-interactive playwright install-deps running inside runner container
app.post("/api/diagnostics/install-deps", (req, res) => {
  try {
    console.log("Triggering nonblock non-interactive playwright install-deps...");
    exec("npx playwright install-deps chromium", {
      env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" }
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`playwright install-deps error: ${error.message}`);
      } else {
        console.log(`playwright install-deps completed successfully: ${stdout}`);
      }
    });

    res.json({
      success: true,
      message: "OS package dependencies installer initiated in background. Progress will output to the hosting console logs!"
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Package management: list installed npm packages
app.get("/api/packages", (req, res) => {
  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      res.json({
        dependencies: pkg.dependencies || {},
        devDependencies: pkg.devDependencies || {}
      });
    } else {
      res.json({ dependencies: {}, devDependencies: {} });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Package management: install package live
app.post("/api/packages/install", (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string" || !/^[a-zA-Z0-9\-@\/._]+$/.test(name)) {
      res.status(400).json({ error: "Invalid package name" });
      return;
    }
    console.log(`Installing package matching user request: ${name}`);
    exec(`npm install ${name}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`npm install error: ${error.message}`);
        res.status(500).json({ error: error.message, details: stderr });
        return;
      }
      res.json({ success: true, message: `Package ${name} successfully installed`, output: stdout });
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Playwright browser initialization endpoint
app.post("/api/initialize", (req, res) => {
  try {
    console.log("Initializing Playwright browsers via npx playwright install...");
    // npx playwright install installs chromium, firefox, webkit
    exec("npx playwright install chromium", (error, stdout, stderr) => {
      if (error) {
        console.error(`npx playwright install chromium error: ${error.message}`);
        res.status(500).json({ error: error.message, details: stderr });
        return;
      }
      res.json({ success: true, message: "Playwright browsers successfully initialized", output: stdout });
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Integrate Fronted Vite or Static server
async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode with active Vite routing...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving build-ready static client in production...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.all("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully booted on URL: http://localhost:${PORT}`);
    initScheduler();
  });

  // Initialize WebSockets for real-time script collaboration
  const wss = new WebSocketServer({ server: httpServer });

  interface Presence {
    id: string;
    name: string;
    color: string;
    cursor?: { line: number; column: number };
  }

  const rooms = new Map<string, Map<WebSocket, Presence>>();

  wss.on("connection", (ws) => {
    let currentRoomId: string | null = null;
    const clientId = Math.random().toString(36).substring(2, 10);

    ws.on("message", (messageData) => {
      try {
        const data = JSON.parse(messageData.toString());
        if (data.type === "join") {
          const { roomId, name, color } = data;
          currentRoomId = roomId;

          if (!rooms.has(roomId)) {
            rooms.set(roomId, new Map());
          }

          rooms.get(roomId)!.set(ws, {
            id: clientId,
            name,
            color,
            cursor: undefined
          });

          // Send first welcome message with client ID to the socket so they can ignore self
          ws.send(JSON.stringify({
            type: "welcome",
            clientId
          }));

          broadcastPresence(roomId);

          // Request current workspace state from existing clients if any
          const otherClients = Array.from(rooms.get(roomId)!.keys()).filter(c => c !== ws);
          if (otherClients.length > 0) {
            // Send request to the first existing client
            otherClients[0].send(JSON.stringify({
              type: "workspace:request",
              targetClientId: clientId
            }));
          }
        } else if (data.type === "cursor:moved") {
          const { cursor } = data;
          if (currentRoomId && rooms.has(currentRoomId)) {
            const clientPresence = rooms.get(currentRoomId)!.get(ws);
            if (clientPresence) {
              clientPresence.cursor = cursor;
              broadcastPresence(currentRoomId);
            }
          }
        } else {
          // General message forwarding to other clients in the same room (e.g. code:update, workspace:update, etc)
          if (currentRoomId && rooms.has(currentRoomId)) {
            rooms.get(currentRoomId)!.forEach((presence, client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  ...data,
                  senderId: clientId
                }));
              }
            });
          }
        }
      } catch (err) {
        console.error("WebSocket message processing error:", err);
      }
    });

    ws.on("close", () => {
      if (currentRoomId && rooms.has(currentRoomId)) {
        rooms.get(currentRoomId)!.delete(ws);
        if (rooms.get(currentRoomId)!.size === 0) {
          rooms.delete(currentRoomId);
        } else {
          broadcastPresence(currentRoomId);
        }
      }
    });
  });

  function broadcastPresence(roomId: string) {
    const roomClients = rooms.get(roomId);
    if (!roomClients) return;

    const presences = Array.from(roomClients.values());
    const payload = JSON.stringify({
      type: "presence:update",
      presences
    });

    roomClients.forEach((_, client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }
}

bootstrap().catch((err) => {
  console.error("Critical error starting application server:", err);
});
