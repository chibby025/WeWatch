# Admin Dashboard shadcn/ui Upgrade Guide

## ✅ Setup Complete

shadcn/ui is now configured with:
- Card components
- Badge components  
- Utility function for className merging

## 📦 Components Available

### Card Component
```jsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

// Example usage in AdminDashboard.jsx
<Card>
  <CardHeader>
    <CardTitle>Total Revenue</CardTitle>
    <CardDescription>Platform earnings this month</CardDescription>
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">₦2,450,000</div>
  </CardContent>
</Card>
```

### Badge Component
```jsx
import { Badge } from '@/components/ui/badge';

<Badge variant="default">Active</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="secondary">Pending</Badge>
<Badge variant="outline">Draft</Badge>
```

## 🎨 Example: Upgrade Event Analytics Section

**Before (current code):**
```jsx
<div className="bg-white/10 rounded-lg p-4">
  <div className="text-sm text-gray-300 mb-1">Tickets Sold</div>
  <div className="text-2xl font-bold text-purple-400">
    {eventAnalytics.total_tickets_sold?.toLocaleString() || '0'}
  </div>
</div>
```

**After (with shadcn/ui):**
```jsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

<Card className="bg-gradient-to-br from-purple-600/20 to-indigo-600/20 border-purple-500/30">
  <CardHeader>
    <CardTitle className="text-gray-300 text-sm font-medium">Tickets Sold</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="text-3xl font-bold text-purple-400">
      {eventAnalytics.total_tickets_sold?.toLocaleString() || '0'}
    </div>
    <p className="text-xs text-gray-400 mt-2">Paid event tickets</p>
  </CardContent>
</Card>
```

## 🚀 Quick Upgrade Steps

### 1. Update Event Analytics Cards (Lines 1221-1283 in AdminDashboard.jsx)

Replace the current statistics grid with shadcn Cards:

```jsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
  {/* Tickets Sold */}
  <Card className="bg-white/10 border-purple-500/30 backdrop-blur-sm">
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium text-gray-300">Tickets Sold</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold text-purple-400">
        {eventAnalytics.total_tickets_sold?.toLocaleString() || '0'}
      </div>
      <p className="text-xs text-gray-400 mt-1">Paid event tickets</p>
    </CardContent>
  </Card>

  {/* Free RSVPs */}
  <Card className="bg-white/10 border-green-500/30 backdrop-blur-sm">
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium text-gray-300">Free RSVPs</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold text-green-400">
        {eventAnalytics.total_rsvps?.toLocaleString() || '0'}
      </div>
      <p className="text-xs text-gray-400 mt-1">Free event bookings</p>
    </CardContent>
  </Card>

  {/* Add remaining cards... */}
</div>
```

### 2. Update Top Events List (Lines 1295-1321)

```jsx
<Card className="bg-white/5 border-white/10">
  <CardHeader>
    <CardTitle className="text-lg text-white flex items-center gap-2">
      🏆 Top Selling Events
    </CardTitle>
  </CardHeader>
  <CardContent className="space-y-3">
    {eventAnalytics.top_events.slice(0, 5).map((event, index) => (
      <Card key={event.event_id} className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge className="text-xl font-bold bg-purple-500">
                #{index + 1}
              </Badge>
              <div>
                <div className="font-medium text-white">{event.title}</div>
                <div className="text-xs text-gray-400">
                  Room ID: {event.room_id} • {event.watch_type === '3d_cinema' ? '🎬 Cinema' : event.watch_type === 'classroom' ? '🎓 Classroom' : '📺 Video'}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-yellow-400">
                {event.tickets_sold} tickets
              </div>
              <div className="text-xs text-gray-400">
                {formatTokens(event.revenue)} revenue
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    ))}
  </CardContent>
</Card>
```

### 3. Add Status Badges

Use badges for status indicators throughout the dashboard:

```jsx
{/* Event status */}
<Badge variant={event.is_active ? "default" : "secondary"}>
  {event.is_active ? "Active" : "Ended"}
</Badge>

{/* Payment method */}
<Badge variant="outline" className="bg-green-500/20 text-green-300">
  Tokens
</Badge>

{/* Ticket type */}
<Badge variant="secondary">
  {ticket.is_early_bird ? "🎉 Early Bird" : "Regular"}
</Badge>
```

## 🎨 Benefits of shadcn/ui

1. **Consistent Design** - All cards have uniform styling
2. **Accessibility** - Built-in ARIA attributes
3. **Customizable** - Easily extend with Tailwind classes
4. **Type-safe** - Works seamlessly with TypeScript
5. **Professional Look** - Clean, modern aesthetic

## 🔄 Migration Strategy

**Phase 1: Add shadcn imports**
- Import Card and Badge components at top of AdminDashboard.jsx

**Phase 2: Replace cards one section at a time**
- Start with Event Analytics section
- Then Token Analytics
- Then Top Events list

**Phase 3: Add interactive elements**
- Hover effects on cards
- Click to expand details
- Smooth transitions

## 📚 Additional Components to Add Later

```bash
# Run these when needed
npx shadcn@latest add button
npx shadcn@latest add dialog
npx shadcn@latest add table
npx shadcn@latest add tabs
npx shadcn@latest add select
npx shadcn@latest add input
```

## 🎯 Next Steps

1. **Test the setup**: Restart frontend to ensure no errors
2. **Update Event Analytics section**: Replace div cards with shadcn Cards
3. **Add hover effects**: Make cards interactive
4. **Test responsiveness**: Check on mobile/tablet
5. **Iterate**: Gradually replace other dashboard sections

---

**Status:** ✅ Ready to use  
**Files Modified:**
- `components.json` - Configuration
- `src/lib/utils.js` - Utility functions
- `src/components/ui/card.jsx` - Card component
- `src/components/ui/badge.jsx` - Badge component

**Next:** Replace existing div-based cards with shadcn Card components in AdminDashboard.jsx
