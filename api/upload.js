import { put } from '@vercel/blob';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Read the raw body as a buffer
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Parse the content type to get boundary
    const contentType = req.headers['content-type'] || '';
    
    // If it's a direct binary upload with filename in query
    if (req.query.filename) {
      const blob = await put(req.query.filename, buffer, {
        access: 'public',
        contentType: contentType.split(';')[0] || 'image/jpeg',
      });

      return res.status(200).json({ url: blob.url });
    }

    // Otherwise parse multipart form data manually
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      return res.status(400).json({ error: 'No boundary found in content-type' });
    }

    // Simple multipart parser
    const bodyStr = buffer.toString('binary');
    const parts = bodyStr.split('--' + boundary).filter(p => p.trim() && p.trim() !== '--');
    
    let fileData = null;
    let fileName = 'upload_' + Date.now() + '.jpg';
    let fileMimeType = 'image/jpeg';

    for (const part of parts) {
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) continue;
      
      const headers = part.substring(0, headerEnd);
      const body = part.substring(headerEnd + 4);
      
      if (headers.includes('filename=')) {
        // Extract filename
        const fnMatch = headers.match(/filename="([^"]+)"/);
        if (fnMatch) fileName = 'items/' + Date.now() + '_' + fnMatch[1].replace(/[^a-zA-Z0-9._-]/g, '_');
        
        // Extract content type
        const ctMatch = headers.match(/Content-Type:\s*(.+)/i);
        if (ctMatch) fileMimeType = ctMatch[1].trim();
        
        // Remove trailing \r\n-- from body
        fileData = Buffer.from(body.replace(/\r\n$/, ''), 'binary');
      }
    }

    if (!fileData) {
      return res.status(400).json({ error: 'No file found in upload' });
    }

    const blob = await put(fileName, fileData, {
      access: 'public',
      contentType: fileMimeType,
    });

    return res.status(200).json({ url: blob.url });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
}
