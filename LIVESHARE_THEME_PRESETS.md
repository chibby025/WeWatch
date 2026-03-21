# LiveShare Theme Presets - Safe Names Reference

**Last Updated:** January 2025  
**Legal Status:** ✅ Trademark-safe descriptive names  
**Ready to Implement:** Yes

---

## Theme Preset Catalog

### News & Current Affairs

#### 1. Breaking News 🚨
**Style:** Urgent, attention-grabbing  
**Colors:**
- Primary: `#CC0000` (Urgent red)
- Secondary: `#0052A5` (Professional blue)
- Accent: `#FFFFFF` (Clean white)

**Use Case:** Breaking news coverage, urgent announcements, live news broadcasts

**Graphics:**
- Red accent bar on lower thirds
- Scrolling ticker with urgent badge
- Bold, condensed fonts (Roboto Condensed, Arial Bold)

---

#### 2. Political Debate 🗳️
**Style:** Serious, authoritative  
**Colors:**
- Primary: `#003366` (Navy blue)
- Secondary: `#C41E3A` (Deep red)
- Accent: `#FFFFFF` (White)

**Use Case:** Political discussions, election coverage, panel debates

**Graphics:**
- Dual-color scheme (blue/red for bipartisan balance)
- Split lower thirds for multiple guests
- Formal serif fonts (Georgia, Times New Roman)

---

#### 3. World News 🌍
**Style:** Global, professional  
**Colors:**
- Primary: `#000000` (Black)
- Secondary: `#FF0000` (Bright red)
- Accent: `#FFD700` (Gold)

**Use Case:** International news, global events, foreign correspondents

**Graphics:**
- Minimalist black base
- Red accent for importance
- World map background option
- Sans-serif fonts (Helvetica, Arial)

---

### Sports

#### 4. Sports Commentary 🏈
**Style:** Dynamic, high-energy  
**Colors:**
- Primary: `#00A0DF` (Bright blue)
- Secondary: `#FFD700` (Gold/yellow)
- Accent: `#FFFFFF` (White)

**Use Case:** Sports analysis, game commentary, score updates

**Graphics:**
- Bold, athletic fonts
- Animated score tickers
- Team color overlays
- Fast transitions

---

#### 5. Game Analysis 🏀
**Style:** Strategic, analytical  
**Colors:**
- Primary: `#0A2351` (Dark blue)
- Secondary: `#E03A3E` (Red)
- Accent: `#C4CED4` (Silver)

**Use Case:** Post-game analysis, strategy breakdown, coaching discussions

**Graphics:**
- Diagram overlays
- Stats display boxes
- Slow-motion replay frames
- Professional serif fonts

---

### Entertainment

#### 6. Talk Show 🎙️
**Style:** Friendly, conversational  
**Colors:**
- Primary: `#4169E1` (Royal blue)
- Secondary: `#FFFFFF` (White)
- Accent: `#FFD700` (Gold)

**Use Case:** Interview shows, casual conversations, entertainment segments

**Graphics:**
- Soft rounded corners
- Friendly sans-serif fonts (Open Sans, Lato)
- Warm color gradients
- Guest name lower thirds with photos

---

#### 7. Late Night 🌙
**Style:** Cool, intimate  
**Colors:**
- Primary: `#1A1A2E` (Dark navy)
- Secondary: `#16213E` (Deep blue)
- Accent: `#0F3460` (Blue accent)

**Use Case:** Evening shows, comedy segments, celebrity interviews

**Graphics:**
- Dark, moody backgrounds
- Neon-style accents
- City skyline overlays
- Modern thin fonts

---

#### 8. Morning Show ☀️
**Style:** Bright, energetic  
**Colors:**
- Primary: `#FF6B35` (Orange)
- Secondary: `#F7931E` (Bright orange)
- Accent: `#FFC75F` (Light yellow)

**Use Case:** Morning broadcasts, lifestyle segments, upbeat content

**Graphics:**
- Warm sunrise colors
- Cheerful sans-serif fonts
- Light, airy layouts
- Sunrise gradient backgrounds

---

### Business & Finance

#### 9. Business News 💼
**Style:** Professional, trustworthy  
**Colors:**
- Primary: `#0072C6` (Corporate blue)
- Secondary: `#2B2D42` (Charcoal)
- Accent: `#EDF2F4` (Light gray)

**Use Case:** Market updates, business interviews, financial news

**Graphics:**
- Clean, corporate aesthetic
- Stock ticker integration
- Chart/graph overlays
- Professional serif fonts (Georgia)

---

#### 10. Market Watch 📈
**Style:** Data-driven, dynamic  
**Colors:**
- Primary: `#008542` (Growth green)
- Secondary: `#FFFFFF` (White)
- Accent: `#D32F2F` (Loss red)

**Use Case:** Stock market coverage, trading analysis, market updates

**Graphics:**
- Real-time price tickers
- Green/red for gains/losses
- Candlestick chart overlays
- Monospace fonts for numbers

---

### Specialty

#### 11. Documentary 🎬
**Style:** Cinematic, informative  
**Colors:**
- Primary: `#2C3E50` (Slate blue)
- Secondary: `#E74C3C` (Warm red)
- Accent: `#ECF0F1` (Off-white)

**Use Case:** Educational content, storytelling, long-form content

**Graphics:**
- Subtle, non-intrusive overlays
- Chapter markers
- Location/date stamps
- Elegant serif fonts (Merriweather)

---

#### 12. Podcast Studio 🎧
**Style:** Modern, minimal  
**Colors:**
- Primary: `#6A4C93` (Purple)
- Secondary: `#1982C4` (Blue)
- Accent: `#8AC926` (Green)

**Use Case:** Audio shows, podcast recordings, conversational content

**Graphics:**
- Audio waveform visualizations
- Speaker name badges
- Minimalist lower thirds
- Modern sans-serif (Inter, Poppins)

---

#### 13. Educational 📚
**Style:** Clear, authoritative  
**Colors:**
- Primary: `#2A9D8F` (Teal)
- Secondary: `#E76F51` (Coral)
- Accent: `#F4A261` (Sand)

**Use Case:** Lectures, tutorials, educational content

**Graphics:**
- Topic headers
- Key point callouts
- Source citations
- Readable sans-serif fonts (Noto Sans)

---

## Implementation Code

### Theme Object Structure
```javascript
const THEME_PRESETS = {
  BREAKING_NEWS: {
    id: 'breaking_news',
    name: 'Breaking News',
    icon: '🚨',
    colors: {
      primary: '#CC0000',
      secondary: '#0052A5',
      accent: '#FFFFFF',
      text: '#FFFFFF',
      background: 'rgba(0, 0, 0, 0.8)'
    },
    fonts: {
      primary: 'Roboto Condensed',
      secondary: 'Arial Bold'
    },
    animations: {
      lowerThird: 'slide-in-left',
      ticker: 'scroll-continuous',
      banner: 'fade-in'
    },
    layout: {
      lowerThirdHeight: 80,
      tickerHeight: 40,
      bugSize: 60,
      bannerHeight: 100
    }
  },
  
  POLITICAL_DEBATE: {
    id: 'political_debate',
    name: 'Political Debate',
    icon: '🗳️',
    colors: {
      primary: '#003366',
      secondary: '#C41E3A',
      accent: '#FFFFFF',
      text: '#FFFFFF',
      background: 'rgba(0, 0, 0, 0.85)'
    },
    fonts: {
      primary: 'Georgia',
      secondary: 'Times New Roman'
    },
    animations: {
      lowerThird: 'fade-in',
      ticker: 'scroll-smooth',
      banner: 'slide-down'
    },
    layout: {
      lowerThirdHeight: 90,
      tickerHeight: 35,
      bugSize: 70,
      bannerHeight: 120
    }
  },
  
  // ... (add all 13 themes)
};
```

---

## Usage Guidelines

### ✅ Safe Marketing Language
- "Professional broadcast-style graphics"
- "Industry-standard themes for news, sports, and talk shows"
- "Broadcast-quality production values"
- "Themes inspired by major networks"
- "Rival CNN-level production" (comparative advertising)

### ❌ Avoid These Phrases
- "CNN Theme" or "Fox Theme"
- "Official network graphics"
- "Licensed from [Brand]"
- "Endorsed by [Brand]"

---

## Theme Selection UI

### Control Panel Display
```jsx
<div className="theme-selector">
  <h3>Choose Your Broadcast Style</h3>
  
  <div className="theme-grid">
    {/* News Category */}
    <div className="category">
      <h4>📰 News & Current Affairs</h4>
      <ThemeCard theme="BREAKING_NEWS" />
      <ThemeCard theme="POLITICAL_DEBATE" />
      <ThemeCard theme="WORLD_NEWS" />
    </div>
    
    {/* Sports Category */}
    <div className="category">
      <h4>🏈 Sports</h4>
      <ThemeCard theme="SPORTS_COMMENTARY" />
      <ThemeCard theme="GAME_ANALYSIS" />
    </div>
    
    {/* Entertainment Category */}
    <div className="category">
      <h4>🎭 Entertainment</h4>
      <ThemeCard theme="TALK_SHOW" />
      <ThemeCard theme="LATE_NIGHT" />
      <ThemeCard theme="MORNING_SHOW" />
    </div>
    
    {/* Business Category */}
    <div className="category">
      <h4>💼 Business & Finance</h4>
      <ThemeCard theme="BUSINESS_NEWS" />
      <ThemeCard theme="MARKET_WATCH" />
    </div>
    
    {/* Specialty Category */}
    <div className="category">
      <h4>🎬 Specialty</h4>
      <ThemeCard theme="DOCUMENTARY" />
      <ThemeCard theme="PODCAST_STUDIO" />
      <ThemeCard theme="EDUCATIONAL" />
    </div>
  </div>
</div>
```

---

## Preview Images Needed
For each theme, create preview showing:
1. Lower third with name/title
2. Scrolling ticker with sample text
3. Logo bug in corner
4. "Breaking News" banner (if applicable)

**Dimensions:** 1920x1080 (Full HD)  
**Format:** PNG with transparency  
**Location:** `/frontend/public/theme-previews/`

---

## Monetization Tiers

### Free Tier
- 3 basic themes: Breaking News, Talk Show, Educational
- Basic lower thirds only
- No custom branding

### Premium ($10/month)
- All 13 theme presets
- Full graphics package (lower thirds, tickers, banners, bugs)
- Custom logo upload
- 5 custom themes

### Pro ($50/month)
- Everything in Premium
- Unlimited custom themes
- Priority support
- Advanced graphics (split screens, picture-in-picture)

### Studio ($500/month)
- Everything in Pro
- Custom theme design service
- Dedicated account manager
- White-label options

---

## Next Steps

1. ✅ Theme names finalized (descriptive, trademark-safe)
2. ⏳ Implement THEME_PRESETS object in code
3. ⏳ Create LiveShareGraphicsControls component with theme selector
4. ⏳ Design preview images for all 13 themes
5. ⏳ Implement Canvas rendering for graphics overlay
6. ⏳ Test each theme for visual consistency
7. ⏳ Add theme switching animation

**Estimated Time:** 4-5 hours (per LIVESHARE_STUDIO_QUICKSTART.md)

---

**Status:** Ready for Implementation ✅  
**Legal Risk:** ZERO (descriptive names)  
**User Experience:** Professional and intuitive  
**Scalability:** Can add 50+ more themes without legal concerns
