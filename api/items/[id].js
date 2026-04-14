import { put, list, del } from '@vercel/blob';

const ITEMS_BLOB_PATH = 'data/items.json';

// Helper: Read items from Vercel Blob
async function getItems() {
  try {
    const { blobs } = await list({ prefix: 'data/items' });
    if (blobs.length === 0) return [];
    
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
    res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Item ID is required' });
    }

    const items = await getItems();
    const itemIndex = items.findIndex(i => i.id === id);
    
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const item = items[itemIndex];

    // Delete the image blob from Vercel Blob storage
    if (item.image && item.image.includes('vercel-storage.com')) {
      try {
        await del(item.image);
      } catch (delError) {
        console.error('Failed to delete image blob:', delError);
        // Continue even if blob deletion fails
      }
    }

    // Remove item from the list
    items.splice(itemIndex, 1);
    await saveItems(items);

    return res.status(200).json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    console.error('DELETE item error:', error);
    return res.status(500).json({ error: 'Failed to delete item' });
  }
}
