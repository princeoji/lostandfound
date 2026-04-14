import { put, list } from '@vercel/blob';

// The items list is stored as a JSON blob in Vercel Blob
const ITEMS_BLOB_PATH = 'data/items.json';

// Helper: Read items from Vercel Blob
async function getItems() {
  try {
    const { blobs } = await list({ prefix: 'data/items' });
    if (blobs.length === 0) return [];
    
    // Find the items.json blob
    const itemsBlob = blobs.find(b => b.pathname === ITEMS_BLOB_PATH);
    if (!itemsBlob) return [];
    
    const response = await fetch(itemsBlob.url);
    if (!response.ok) return [];
    
    const items = await response.json();
    return Array.isArray(items) ? items : [];
  } catch (error) {
    console.error('Error reading items:', error);
    return [];
  }
}

// Helper: Save items to Vercel Blob
async function saveItems(items) {
  const blob = await put(ITEMS_BLOB_PATH, JSON.stringify(items, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });
  return blob;
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // ─── GET /api/items ── Return all items ──────────────
  if (req.method === 'GET') {
    try {
      const items = await getItems();
      return res.status(200).json(items);
    } catch (error) {
      console.error('GET items error:', error);
      return res.status(500).json({ error: 'Failed to fetch items' });
    }
  }

  // ─── POST /api/items ── Create a new item ────────────
  if (req.method === 'POST') {
    try {
      const { image, category, description, location, uploadedBy, uploaderName } = req.body;

      if (!image || !category || !description || !location || !uploadedBy) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const newItem = {
        id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        image,        // This is now a Vercel Blob URL
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

      return res.status(201).json(newItem);
    } catch (error) {
      console.error('POST items error:', error);
      return res.status(500).json({ error: 'Failed to create item' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
