import { hasBlobToken } from '../lib/itemsStore.js';

export default function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const blobEnabled = hasBlobToken();

  return res.status(200).json({
    ok: true,
    storageMode: blobEnabled ? 'vercel-blob' : 'local-fallback',
    blobTokenPresent: blobEnabled,
    checkedAt: new Date().toISOString(),
  });
}
