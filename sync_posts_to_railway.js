// Sync posts from localhost to Railway (records + CDN URLs)
const { Client } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

// Database configurations
const localhostDB = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'Chibby',
  database: 'wewatch_db'
});

const railwayDB = new Client({
  host: 'ballast.proxy.rlwy.net',
  port: 33527,
  user: 'postgres',
  password: 'RkEIczcIWgoXeWxINbNlNpBeMEUKxhnw',
  database: 'railway'
});

// BunnyCDN Configuration
const BUNNY_STORAGE_ZONE = 'letswatchout';
const BUNNY_REGION = ''; // Frankfurt = empty string
const BUNNY_ACCESS_KEY = '3eee58c0-9da4-4ef6-a7df729194c4-ea0e-4301';
const BUNNY_PULL_ZONE_URL = 'https://LetsWatchOut.b-cdn.net';

function getBunnyCDNStorageURL() {
  const base = 'https://storage.bunnycdn.com';
  return BUNNY_REGION ? `${base}/${BUNNY_STORAGE_ZONE}` : `${base}/${BUNNY_STORAGE_ZONE}`;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function uploadToBunnyCDN(localFilePath, remotePath) {
  try {
    const fileBuffer = await fs.readFile(localFilePath);
    const uploadURL = `${getBunnyCDNStorageURL()}/${remotePath}`;
    
    console.log(`📤 Uploading to: ${uploadURL}`);
    
    await axios.put(uploadURL, fileBuffer, {
      headers: {
        'AccessKey': BUNNY_ACCESS_KEY,
        'Content-Type': 'application/octet-stream'
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    const cdnUrl = `${BUNNY_PULL_ZONE_URL}/${remotePath}`;
    console.log(`✅ Uploaded: ${cdnUrl}`);
    return cdnUrl;
  } catch (error) {
    console.error(`❌ Upload failed:`, error.message);
    return null;
  }
}

async function syncPosts() {
  console.log('\n📸 === SYNCING POSTS TO RAILWAY ===\n');

  // Fetch all posts from localhost
  const localhostPosts = await localhostDB.query(
    `SELECT * FROM posts WHERE deleted_at IS NULL ORDER BY created_at DESC`
  );

  console.log(`Found ${localhostPosts.rows.length} posts on localhost\n`);

  for (const post of localhostPosts.rows) {
    try {
      // Check if post already exists on Railway
      const existing = await railwayDB.query(
        'SELECT id FROM posts WHERE id = $1',
        [post.id]
      );

      let videoUrl = post.video_url;
      let thumbnailUrl = post.thumbnail_url;

      // Upload video to BunnyCDN if it's a local path
      if (videoUrl && !videoUrl.startsWith('http')) {
        const localPath = path.join('/home/chibuzor_dev/WeWatch/backend', videoUrl);
        if (await fileExists(localPath)) {
          const timestamp = Math.floor(Date.now() / 1000);
          const fileName = path.basename(videoUrl);
          const remotePath = `posts/${post.user_id}/${post.id}_${timestamp}_${fileName}`;
          const cdnUrl = await uploadToBunnyCDN(localPath, remotePath);
          if (cdnUrl) videoUrl = cdnUrl;
        }
      }

      // Upload thumbnail to BunnyCDN if it's a local path
      if (thumbnailUrl && !thumbnailUrl.startsWith('http')) {
        const localPath = path.join('/home/chibuzor_dev/WeWatch/backend', thumbnailUrl);
        if (await fileExists(localPath)) {
          const timestamp = Math.floor(Date.now() / 1000);
          const fileName = path.basename(thumbnailUrl);
          const remotePath = `posts/${post.user_id}/thumb_${post.id}_${timestamp}_${fileName}`;
          const cdnUrl = await uploadToBunnyCDN(localPath, remotePath);
          if (cdnUrl) thumbnailUrl = cdnUrl;
        }
      }

      if (existing.rows.length === 0) {
        // Insert new post into Railway
        await railwayDB.query(
          `INSERT INTO posts (
            id, user_id, room_id, title, description, 
            video_url, thumbnail_url, media_type, post_type, duration,
            resolution, view_count, likes_count, comments_count,
            is_paid, price, is_public, allow_downloads, downloads_count,
            created_at, updated_at, deleted_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
          ON CONFLICT (id) DO UPDATE SET
            video_url = EXCLUDED.video_url,
            thumbnail_url = EXCLUDED.thumbnail_url,
            updated_at = NOW()`,
          [
            post.id,
            post.user_id,
            post.room_id,
            post.title,
            post.description,
            videoUrl,
            thumbnailUrl,
            post.media_type,
            post.post_type,
            post.duration,
            post.resolution,
            post.view_count || 0,
            post.likes_count || 0,
            post.comments_count || 0,
            post.is_paid || false,
            post.price,
            post.is_public !== false, // default true
            post.allow_downloads !== false, // default true
            post.downloads_count || 0,
            post.created_at,
            post.updated_at,
            post.deleted_at
          ]
        );
        console.log(`✅ Synced post ${post.id} - "${post.title}"`);
      } else {
        // Update existing post with CDN URLs
        await railwayDB.query(
          `UPDATE posts SET 
            video_url = $1, 
            thumbnail_url = $2, 
            updated_at = NOW() 
          WHERE id = $3`,
          [videoUrl, thumbnailUrl, post.id]
        );
        console.log(`⏩ Updated post ${post.id} - "${post.title}"`);
      }
    } catch (error) {
      console.error(`❌ Failed to sync post ${post.id}:`, error.message);
    }
  }
}

async function main() {
  console.log('🚀 === SYNC POSTS TO RAILWAY ===\n');
  console.log(`📦 Storage Zone: ${BUNNY_STORAGE_ZONE}`);
  console.log(`🌍 Region: Frankfurt (empty string)`);
  console.log(`🔗 CDN URL: ${BUNNY_PULL_ZONE_URL}\n`);

  try {
    // Test database connections
    console.log('🔌 Testing database connections...');
    await localhostDB.connect();
    console.log('✅ Localhost PostgreSQL connected');
    await railwayDB.connect();
    console.log('✅ Railway PostgreSQL connected');

    await syncPosts();

    console.log('\n🎉 === SYNC COMPLETE ===\n');
  } catch (error) {
    console.error('❌ Sync failed:', error);
  } finally {
    await localhostDB.end();
    await railwayDB.end();
  }
}

main();
