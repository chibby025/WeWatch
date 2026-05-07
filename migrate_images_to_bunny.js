#!/usr/bin/env node
/**
 * Migrate All Images to BunnyCDN
 * 
 * This script:
 * 1. Connects to localhost PostgreSQL and Railway PostgreSQL
 * 2. Finds all images (avatars, chat attachments, post images)
 * 3. Uploads them to BunnyCDN
 * 4. Updates database records with BunnyCDN URLs
 * 5. Syncs friendships from localhost to Railway
 */

const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');
const axios = require('axios');
const FormData = require('form-data');

// BunnyCDN Configuration
const BUNNY_STORAGE_ZONE = 'letswatchout';
const BUNNY_ACCESS_KEY = '3eee58c0-9da4-4ef6-a7df729194c4-ea0e-4301';
const BUNNY_STORAGE_REGION = ''; // Frankfurt (empty string)
const BUNNY_PULL_ZONE_URL = 'https://LetsWatchOut.b-cdn.net';
const BUNNY_STORAGE_URL = `https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}`;

// Database configurations
const localhostDB = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'Chibby',
  database: 'wewatch_db',
});

const railwayDB = new Pool({
  host: 'ballast.proxy.rlwy.net',
  port: 33527,
  user: 'postgres',
  password: 'RkEIczcIWgoXeWxINbNlNpBeMEUKxhnw',
  database: 'railway',
});

// Upload file to BunnyCDN
async function uploadToBunnyCDN(localFilePath, remotePath) {
  try {
    const fileBuffer = await fs.readFile(localFilePath);
    const uploadUrl = `${BUNNY_STORAGE_URL}/${remotePath}`;

    console.log(`📤 Uploading to: ${uploadUrl}`);

    const response = await axios.put(uploadUrl, fileBuffer, {
      headers: {
        'AccessKey': BUNNY_ACCESS_KEY,
        'Content-Type': 'application/octet-stream',
      },
    });

    if (response.status === 201) {
      const cdnUrl = `${BUNNY_PULL_ZONE_URL}/${remotePath}`;
      console.log(`✅ Uploaded: ${cdnUrl}`);
      return cdnUrl;
    } else {
      throw new Error(`Upload failed with status ${response.status}`);
    }
  } catch (error) {
    console.error(`❌ Upload failed for ${localFilePath}:`, error.message);
    return null;
  }
}

// Check if file exists locally
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Migrate user avatars
async function migrateAvatars() {
  console.log('\n🎨 === MIGRATING USER AVATARS ===\n');

  const localhostUsers = await localhostDB.query(
    `SELECT id, username, avatar_url FROM users 
     WHERE avatar_url IS NOT NULL 
     AND avatar_url != '/avatars/default.png' 
     AND avatar_url NOT LIKE 'http%'`
  );

  console.log(`Found ${localhostUsers.rows.length} users with local avatars`);

  for (const user of localhostUsers.rows) {
    const localPath = path.join('/home/chibuzor_dev/WeWatch/backend', user.avatar_url);
    
    if (await fileExists(localPath)) {
      const fileName = path.basename(user.avatar_url);
      const remotePath = `avatars/${user.id}_${fileName}`;
      const cdnUrl = await uploadToBunnyCDN(localPath, remotePath);

      if (cdnUrl) {
        // Update Railway database
        await railwayDB.query(
          'UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2',
          [cdnUrl, user.id]
        );
        console.log(`✅ Updated user ${user.username} avatar`);
      }
    } else {
      console.log(`⚠️  File not found: ${localPath}`);
    }
  }
}

// Migrate lobby chat attachments
async function migrateChatAttachments() {
  console.log('\n💬 === MIGRATING LOBBY CHAT ATTACHMENTS ===\n');

  const localhostChats = await localhostDB.query(
    `SELECT id, sender_id, recipient_id, attachment_url, attachment_name, message_type
     FROM lobby_chats 
     WHERE attachment_url IS NOT NULL 
     AND attachment_url NOT LIKE 'http%'
     ORDER BY created_at DESC`
  );

  console.log(`Found ${localhostChats.rows.length} chat messages with attachments`);

  for (const chat of localhostChats.rows) {
    const localPath = path.join('/home/chibuzor_dev/WeWatch/backend', chat.attachment_url);

    if (await fileExists(localPath)) {
      const fileName = chat.attachment_name || path.basename(chat.attachment_url);
      const remotePath = `chat/${chat.sender_id}/${Date.now()}_${fileName}`;
      const cdnUrl = await uploadToBunnyCDN(localPath, remotePath);

      if (cdnUrl) {
        // Update Railway database
        await railwayDB.query(
          'UPDATE lobby_chats SET attachment_url = $1, updated_at = NOW() WHERE id = $2',
          [cdnUrl, chat.id]
        );
        console.log(`✅ Updated chat ${chat.id} attachment`);
      }
    } else {
      console.log(`⚠️  File not found: ${localPath}`);
    }
  }
}

// Migrate post images (discover feed / watching now)
async function migratePostImages() {
  console.log('\n📸 === MIGRATING POST IMAGES ===\n');

  const localhostPosts = await localhostDB.query(
    `SELECT id, user_id, video_url, thumbnail_url FROM posts 
     WHERE (video_url IS NOT NULL OR thumbnail_url IS NOT NULL)
     AND (video_url NOT LIKE 'http%' OR thumbnail_url NOT LIKE 'http%')
     ORDER BY created_at DESC`
  );

  console.log(`Found ${localhostPosts.rows.length} posts with local media`);

  for (const post of localhostPosts.rows) {
    let updatedVideoUrl = post.video_url;
    let updatedThumbnailUrl = post.thumbnail_url;

    // Upload video if local
    if (post.video_url && !post.video_url.startsWith('http')) {
      const localPath = path.join('/home/chibuzor_dev/WeWatch/backend', post.video_url);
      if (await fileExists(localPath)) {
        const fileName = path.basename(post.video_url);
        const remotePath = `posts/${post.user_id}/${post.id}_${fileName}`;
        const cdnUrl = await uploadToBunnyCDN(localPath, remotePath);
        if (cdnUrl) updatedVideoUrl = cdnUrl;
      }
    }

    // Upload thumbnail if local
    if (post.thumbnail_url && !post.thumbnail_url.startsWith('http')) {
      const localPath = path.join('/home/chibuzor_dev/WeWatch/backend', post.thumbnail_url);
      if (await fileExists(localPath)) {
        const fileName = path.basename(post.thumbnail_url);
        const remotePath = `posts/${post.user_id}/thumb_${post.id}_${fileName}`;
        const cdnUrl = await uploadToBunnyCDN(localPath, remotePath);
        if (cdnUrl) updatedThumbnailUrl = cdnUrl;
      }
    }

    // Update Railway database
    if (updatedVideoUrl !== post.video_url || updatedThumbnailUrl !== post.thumbnail_url) {
      await railwayDB.query(
        'UPDATE posts SET video_url = $1, thumbnail_url = $2, updated_at = NOW() WHERE id = $3',
        [updatedVideoUrl, updatedThumbnailUrl, post.id]
      );
      console.log(`✅ Updated post ${post.id} media`);
    }
  }
}

// Sync friendships from localhost to Railway
async function syncFriendships() {
  console.log('\n👥 === SYNCING FRIENDSHIPS ===\n');

  const localhostFriendships = await localhostDB.query(
    'SELECT * FROM friendships ORDER BY created_at DESC'
  );

  console.log(`Found ${localhostFriendships.rows.length} friendships on localhost`);

  for (const friendship of localhostFriendships.rows) {
    try {
      // Check if already exists on Railway
      const existing = await railwayDB.query(
        `SELECT id FROM friendships 
         WHERE requester_id = $1 AND recipient_id = $2`,
        [friendship.requester_id, friendship.recipient_id]
      );

      if (existing.rows.length === 0) {
        // Insert into Railway
        await railwayDB.query(
          `INSERT INTO friendships (id, requester_id, recipient_id, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [
            friendship.id,
            friendship.requester_id,
            friendship.recipient_id,
            friendship.status,
            friendship.created_at,
            friendship.updated_at
          ]
        );
        console.log(`✅ Synced friendship ${friendship.id}`);
      } else {
        console.log(`⏩ Friendship ${friendship.id} already exists on Railway`);
      }
    } catch (error) {
      console.error(`❌ Failed to sync friendship ${friendship.id}:`, error.message);
    }
  }
}

// Sync lobby chats from localhost to Railway
async function syncLobbyChats() {
  console.log('\n💬 === SYNCING LOBBY CHATS ===\n');

  const localhostChats = await localhostDB.query(
    'SELECT * FROM lobby_chats ORDER BY created_at DESC'
  );

  console.log(`Found ${localhostChats.rows.length} lobby chats on localhost`);

  for (const chat of localhostChats.rows) {
    try {
      // Check if already exists on Railway
      const existing = await railwayDB.query(
        'SELECT id FROM lobby_chats WHERE id = $1',
        [chat.id]
      );

      if (existing.rows.length === 0) {
        // Insert into Railway
        await railwayDB.query(
          `INSERT INTO lobby_chats (
            id, sender_id, recipient_id, message, message_type, 
            attachment_url, attachment_name, attachment_size, metadata,
            edited, deleted_by_sender, deleted_by_recipient, read_at,
            created_at, updated_at, deleted_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO NOTHING`,
          [
            chat.id,
            chat.sender_id,
            chat.recipient_id,
            chat.message,
            chat.message_type,
            chat.attachment_url,
            chat.attachment_name,
            chat.attachment_size,
            chat.metadata,
            chat.edited,
            chat.deleted_by_sender,
            chat.deleted_by_recipient,
            chat.read_at,
            chat.created_at,
            chat.updated_at,
            chat.deleted_at
          ]
        );
        console.log(`✅ Synced chat ${chat.id}`);
      } else {
        console.log(`⏩ Chat ${chat.id} already exists on Railway`);
      }
    } catch (error) {
      console.error(`❌ Failed to sync chat ${chat.id}:`, error.message);
    }
  }
}

// Main execution
async function main() {
  console.log('🚀 === IMAGE MIGRATION TO BUNNYCDN ===\n');
  console.log(`📦 Storage Zone: ${BUNNY_STORAGE_ZONE}`);
  console.log(`🌍 Region: Frankfurt (empty string)`);
  console.log(`🔗 CDN URL: ${BUNNY_PULL_ZONE_URL}\n`);

  try {
    // Test database connections
    console.log('🔌 Testing database connections...');
    await localhostDB.query('SELECT 1');
    console.log('✅ Localhost PostgreSQL connected');
    await railwayDB.query('SELECT 1');
    console.log('✅ Railway PostgreSQL connected\n');

    // Run migrations in order
    await syncFriendships(); // Sync friendships first
    await syncLobbyChats(); // Sync chats second (before uploading attachments)
    await migrateAvatars();
    await migrateChatAttachments();
    await migratePostImages();

    console.log('\n🎉 === MIGRATION COMPLETE ===\n');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await localhostDB.end();
    await railwayDB.end();
  }
}

main();
