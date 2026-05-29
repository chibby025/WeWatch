export const config = { runtime: 'edge' };

const ALLOWED_EXTENSIONS = new Set(['mp4', 'avi', 'mov', 'mkv', 'webm']);

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'PUT') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const url = new URL(request.url);
  const cdnPath = url.searchParams.get('path');
  if (!cdnPath) {
    return new Response(JSON.stringify({ error: 'Missing path parameter' }), { status: 400 });
  }

  // Allow final video files (with extension) and intermediate chunk files
  const ext = cdnPath.split('.').pop()?.toLowerCase();
  const isVideoFile = ALLOWED_EXTENSIONS.has(ext);
  const isChunkFile = /^(temp-media|media)\/[\w_-]+\/chunk_\d+$/.test(cdnPath);

  if (!isVideoFile && !isChunkFile) {
    return new Response(JSON.stringify({ error: 'Invalid file path' }), { status: 400 });
  }

  const storageZone = process.env.BUNNY_STORAGE_ZONE;
  const accessKey = process.env.BUNNY_ACCESS_KEY;
  const region = process.env.BUNNY_STORAGE_REGION || 'ny';

  if (!storageZone || !accessKey) {
    return new Response(JSON.stringify({ error: 'Storage not configured' }), { status: 500 });
  }

  const bunnyUrl = `https://${region}.storage.bunnycdn.com/${storageZone}/${cdnPath}`;
  const contentType = request.headers.get('Content-Type') || 'application/octet-stream';

  const bunnyResponse = await fetch(bunnyUrl, {
    method: 'PUT',
    headers: {
      AccessKey: accessKey,
      'Content-Type': contentType,
    },
    body: request.body,
  });

  const responseText = await bunnyResponse.text();
  return new Response(
    bunnyResponse.ok ? JSON.stringify({ success: true }) : responseText,
    {
      status: bunnyResponse.ok ? 200 : bunnyResponse.status,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
