# 🚀 Migration Guide: BunnyCDN + Railway Database

## ✅ Step 1: Add BunnyCDN Env Variables to Railway

**Go to Railway Dashboard:**
1. Open your Railway project: https://railway.app
2. Select your **Backend** service (not PostgreSQL)
3. Click **Variables** tab
4. Add these 4 variables:

```bash
BUNNY_STORAGE_ZONE=letswatchout
BUNNY_ACCESS_KEY=3eee58c0-9da4-4ef6-a7df729194c4-ea0e-4301
BUNNY_STORAGE_REGION=ny
BUNNY_PULL_ZONE_URL=https://LetsWatchOut.b-cdn.net
```

5. Click **Deploy** (Railway will restart automatically)

---

## ✅ Step 2: Export Room Groups from Localhost

**Method 1: Using psql (Recommended)**

```bash
# Connect to your localhost database
psql -U postgres -d wewatch_db

# Run this query to see your room groups:
SELECT id, room_id, name, icon, created_by FROM room_groups;

# Export room groups for room 108:
\copy (SELECT * FROM room_groups WHERE room_id = 108) TO 'room_groups_export.csv' WITH CSV HEADER;

# Export memberships:
\copy (SELECT * FROM user_room_groups WHERE room_group_id IN (SELECT id FROM room_groups WHERE room_id = 108)) TO 'user_room_groups_export.csv' WITH CSV HEADER;
```

**Method 2: Get INSERT Statements (Easier)**

```bash
# Run this in psql to get INSERT statements you can copy/paste:
psql -U postgres -d wewatch_db -f export_room_groups.sql
```

---

## ✅ Step 3: Import to Railway PostgreSQL

### **Option A: Via Railway CLI (Fastest)**

```bash
# Install Railway CLI (if not installed)
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project
cd /path/to/WeWatch
railway link

# Connect to Railway PostgreSQL
railway connect postgres

# Now you're in Railway's PostgreSQL, run:
# Paste the INSERT statements from Step 2
```

### **Option B: Via Railway Dashboard (Easiest for beginners)**

1. Go to Railway Dashboard → Select **PostgreSQL** service
2. Click **Data** tab
3. Click **Query** button
4. Paste your INSERT statements from Step 2
5. Click **Run**

### **Option C: Via pgAdmin/DataGrip (GUI Tool)**

1. Get Railway PostgreSQL connection details:
   - Host: `ballast.proxy.rlwy.net`
   - Port: `33527`
   - Database: `railway`
   - User: `postgres`
   - Password: `RkEIczcIWgoXeWxINbNlNpBeMEUKxhnw`

2. Connect using pgAdmin or DataGrip
3. Run the INSERT statements

---

## ✅ Step 4: Test on Vercel

```bash
# Deploy your updated backend to Railway
cd backend
git add .
git commit -m "Migrate room images to BunnyCDN"
git push

# Wait for Railway to deploy (check dashboard)

# Test on Vercel:
1. Go to https://letswatchout.vercel.app/room/108
2. Room image should now load! ✅
3. Check sidebar for room groups ✅
```

---

## ✅ Step 5: Re-upload Room Image (if needed)

If your existing room image doesn't show:

1. Go to your room on Vercel
2. Open Room Settings (gear icon)
3. Upload a new image
4. It will now be stored on BunnyCDN permanently! 🎉

---

## 🔍 Troubleshooting

### Room image still 404?
- Check Railway logs: `railway logs`
- Look for: `📤 [BunnyCDN] Uploading file`
- Verify env variables are set in Railway dashboard

### Room groups still not showing?
- Check Railway PostgreSQL data tab
- Run: `SELECT * FROM room_groups WHERE room_id = 108;`
- If empty, re-run import from Step 3

### Need help?
- Check Railway logs for errors
- Verify BunnyCDN credentials are correct
- Make sure all 4 BUNNY_* variables are set in Railway

---

## 📊 Quick Verification Queries

**Check if groups exist in Railway:**
```sql
-- Run in Railway PostgreSQL
SELECT 
    rg.id, 
    rg.name, 
    rg.icon, 
    COUNT(urg.user_id) as member_count
FROM room_groups rg
LEFT JOIN user_room_groups urg ON rg.id = urg.room_group_id
WHERE rg.room_id = 108
GROUP BY rg.id, rg.name, rg.icon;
```

**Check room image URL format:**
```sql
-- Should be https://LetsWatchOut.b-cdn.net/... after migration
SELECT id, name, image_url FROM rooms WHERE id = 108;
```
