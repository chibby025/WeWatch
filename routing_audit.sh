#!/bin/bash
# Fix all relative API URLs to use API_BASE_URL

echo "🔍 Scanning for routing issues..."
echo ""

# List of files with fetch('/api/...')
echo "📋 Files with relative fetch URLs:"
echo "  1. AdsManagementModal.jsx"
echo "  2. AdCampaignCreator.jsx"
echo "  3. RoomGroupEditModal.jsx"
echo "  4. AdInquiryForm.jsx"
echo "  5. AdBanner.jsx (tracking calls)"
echo "  6. AdVideoPreroll.jsx (tracking calls)"
echo "  7. LiveShareManager.jsx"
echo "  8. LeftSidebar.jsx"
echo ""

echo "✅ Priority fixes needed:"
echo "  - Payment/Wallet pages (critical)"
echo "  - Admin dashboard"
echo "  - Ad system components"
echo "  - Media upload components"
echo ""

echo "📊 Testing checklist:"
echo "  [ ] Home/Lobby page"
echo "  [ ] Room page (already tested ✅)"
echo "  [ ] Wallet page"
echo "  [ ] Payment page"
echo "  [ ] Withdrawal page"
echo "  [ ] Admin dashboard"
echo "  [ ] Ad inquiry form"
echo "  [ ] Media uploads"
echo ""

echo "🎯 Next step: Fix payment/wallet pages first (user-facing critical features)"
