-- Migration: Promote user ID 7 (chibi) to super_admin
-- This enables platform analytics and admin functionality

UPDATE users 
SET role = 'super_admin' 
WHERE id = 7;
