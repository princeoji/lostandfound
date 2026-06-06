import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { list, put } from '@vercel/blob';

const ITEMS_BLOB_PATH = 'data/items.json';

function getLocalItemsPath() {
  // If a blob token is present prefer the repo data path (useful for local dev)
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return path.join(process.cwd(), 'data', 'items.local.json');
  }

  // On serverless platforms (Vercel) the project filesystem is read-only.
  // Use the OS temp directory which is writable in serverless functions.
  const tmp = process.env.TMPDIR || process.env.TEMP || process.env.TMP || os.tmpdir();
  return path.join(tmp, 'lostandfound', 'items.local.json');
}

export function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readItemsFromBlob() {
  const { blobs } = await list({ prefix: 'data/items' });
  if (blobs.length === 0) return [];

  const itemsBlob = blobs.find((b) => b.pathname === ITEMS_BLOB_PATH);
  if (!itemsBlob) return [];

  const response = await fetch(itemsBlob.url);
  if (!response.ok) return [];

  const items = await response.json();
  return Array.isArray(items) ? items : [];
}

async function writeItemsToBlob(items) {
  return put(ITEMS_BLOB_PATH, JSON.stringify(items, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });
}

async function readItemsFromLocalFile() {
  try {
    const LOCAL_ITEMS_PATH = getLocalItemsPath();
    const raw = await readFile(LOCAL_ITEMS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeItemsToLocalFile(items) {
  const LOCAL_ITEMS_PATH = getLocalItemsPath();
  try {
    await mkdir(path.dirname(LOCAL_ITEMS_PATH), { recursive: true });
    await writeFile(LOCAL_ITEMS_PATH, JSON.stringify(items, null, 2), 'utf8');
  } catch (err) {
    // If writing to the filesystem fails (read-only FS on some platforms),
    // log a warning and continue without throwing so API handlers can
    // return a reasonable response instead of crashing the function.
    console.warn('writeItemsToLocalFile: failed to write local items file:', err && err.code ? err.code : err);
  }
}

export async function getItems() {
  if (hasBlobToken()) {
    return readItemsFromBlob();
  }
  return readItemsFromLocalFile();
}

export async function saveItems(items) {
  if (hasBlobToken()) {
    return writeItemsToBlob(items);
  }
  await writeItemsToLocalFile(items);
  return { pathname: 'data/items.local.json', url: null };
}
