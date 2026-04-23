/* ============================================================
   LOST & FOUND — Standalone Local Development Server
   Replaces `vercel dev` so the project works without Vercel CLI.
   Run with: node server.js
   ============================================================ */

import express from 'express';
import multer from 'multer';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Paths ──────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const ITEMS_FILE = path.join(DATA_DIR, 'items.local.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// ─── Ensure directories exist ───────────────────────────────
async function ensureDirs() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(UPLOADS_DIR)) await mkdir(UPLOADS_DIR, { recursive: true });
}

// ─── Items Store (local JSON file) ──────────────────────────
async function getItems() {
  try {
    const raw = await readFile(ITEMS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function saveItems(items) {
  await mkdir(path.dirname(ITEMS_FILE), { recursive: true });
  await writeFile(ITEMS_FILE, JSON.stringify(items, null, 2), 'utf8');
}

// ─── Middleware ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS headers for all API routes
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// Serve static files (index.html, app.js, styles.css)
app.use(express.static(__dirname, {
  index: 'index.html',
  extensions: ['html'],
}));

// Serve uploaded images
app.use('/uploads', express.static(UPLOADS_DIR));

// ─── Multer config for image uploads ────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueName = Date.now() + '_' + safeName;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// ─── API Routes ─────────────────────────────────────────────

// GET /api/items — Return all items
app.get('/api/items', async (_req, res) => {
  try {
    const items = await getItems();
    res.json(items);
  } catch (error) {
    console.error('GET /api/items error:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// POST /api/items — Create a new item
app.post('/api/items', async (req, res) => {
  try {
    const { image, category, description, location, uploadedBy, uploaderName } = req.body;

    if (!image || !category || !description || !location || !uploadedBy) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newItem = {
      id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      image,
      category,
      description,
      location,
      uploadedBy,
      uploaderName: uploaderName || 'Unknown',
      timestamp: new Date().toISOString(),
    };

    const items = await getItems();
    items.push(newItem);
    await saveItems(items);

    res.status(201).json(newItem);
  } catch (error) {
    console.error('POST /api/items error:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// DELETE /api/items/:id — Delete an item
app.delete('/api/items/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Item ID is required' });
    }

    const items = await getItems();
    const itemIndex = items.findIndex(i => i.id === id);

    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Remove item from the list
    items.splice(itemIndex, 1);
    await saveItems(items);

    res.json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    console.error('DELETE /api/items/:id error:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// POST /api/upload — Upload an image
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file found in upload' });
    }

    // Return the URL relative to the server root
    const url = '/uploads/' + req.file.filename;
    res.json({ url, storage: 'local' });
  } catch (error) {
    console.error('POST /api/upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Multer error handling
app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Max 5MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(500).json({ error: err.message });
  }
  next();
});

// GET /api/health/storage — Health check
app.get('/api/health/storage', (_req, res) => {
  res.json({
    ok: true,
    storageMode: 'local-fallback',
    blobTokenPresent: false,
    checkedAt: new Date().toISOString(),
  });
});

// ─── Fallback: serve index.html for non-API routes ──────────
app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Start Server ───────────────────────────────────────────
await ensureDirs();

app.listen(PORT, () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════╗');
  console.log('  ║   🔍 Lost & Found — Local Dev Server      ║');
  console.log('  ╠═══════════════════════════════════════════╣');
  console.log(`  ║   → http://localhost:${PORT}                 ║`);
  console.log('  ║   Storage: local file system               ║');
  console.log('  ║   Press Ctrl+C to stop                     ║');
  console.log('  ╚═══════════════════════════════════════════╝');
  console.log('');
});
