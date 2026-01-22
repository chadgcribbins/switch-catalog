# Nintendo Switch Catalog

**Status:** Active Development
**Type:** Personal game tracking and discovery tool
**Tech:** Vanilla JavaScript + Node.js import scripts

## Overview

A Nintendo Switch game catalog and wishlist tracker with integrated data from multiple sources:
- **IGDB** (Internet Game Database) - Game metadata, cover art, descriptions
- **Metacritic** - Review scores and critical reception
- **Nintendo eShops** (US & UK) - Official pricing, sales, availability

Track your owned games, build a wishlist, and discover new titles with comprehensive game information all in one place.

## Features

### Personal Collection Management
- **Owned Games** - Track games you own
- **Wishlist** - Build and maintain your wishlist
- **Store Catalog** - Browse complete Switch game library

### Rich Game Data
- Cover artwork and screenshots
- Metacritic scores and review counts
- IGDB ratings and popularity metrics
- Release dates and platform info
- Genre and theme tags
- Developer and publisher info

### Data Sources Integration
- Automatic data enrichment from multiple APIs
- Cached responses for performance
- Periodic refresh capabilities
- Nintendo official pricing (US & UK markets)

## Project Structure

```
switch-catalog/
├── app/
│   ├── index.html        # Main application UI
│   ├── app.js           # Frontend logic
│   └── styles.css       # Styling
├── import-igdb.js        # IGDB API import script
├── import-metacritic.js  # Metacritic data import
├── import-nintendo-us.js # Nintendo US eShop import
├── import-nintendo-uk.js # Nintendo UK eShop import
├── enrich-owned.js       # Enrich owned games with data
├── build-store-catalog.js # Build unified catalog
├── serve.js              # Local development server
├── catalog.json          # Master game catalog
├── owned.json           # Your owned games
├── wish_list.json       # Your wishlist
└── store_catalog.json   # Complete store catalog
```

## Getting Started

### Prerequisites
- Node.js 16+
- IGDB API credentials (free at igdb.com)
- Metacritic access (for review data)

### Setup

1. **Configure Environment:**
```bash
cp .env.example .env
# Add your IGDB credentials to .env
```

2. **Run Import Scripts:**
```bash
# Import from IGDB (primary source)
node import-igdb.js

# Enrich with Metacritic scores
node import-metacritic.js

# Add Nintendo official data
node import-nintendo-us.js
node import-nintendo-uk.js

# Build final catalog
node build-store-catalog.js
```

3. **Enrich Your Collection:**
```bash
# Add metadata to your owned games
node enrich-owned.js
```

4. **Start Development Server:**
```bash
node serve.js
# Open http://localhost:5500
```

## Data Files

### Source Files (Tracked in Git)
- `owned.json` - Your personal collection
- `wish_list.json` - Games on your wishlist
- `catalog.json` - Master catalog
- `store_catalog.json` - Complete store data

### Cache Files (Ignored)
- `igdb_cache.json` - IGDB API response cache
- `igdb_token.json` - IGDB auth token
- `metacritic_cache.json` - Metacritic data cache
- `nintendo_*_import.json` - Large Nintendo API dumps

## Import Scripts

### `import-igdb.js`
Primary data source for game metadata:
- Game titles and descriptions
- Cover artwork and screenshots
- Release dates and platforms
- Genres, themes, and tags
- Developer and publisher info
- IGDB ratings and popularity

### `import-metacritic.js`
Adds critical review data:
- Metacritic scores
- Review counts
- Critic vs. user ratings

### `import-nintendo-us.js` & `import-nintendo-uk.js`
Official Nintendo data:
- Current prices
- Sales and discounts
- Availability status
- Official product IDs

### `build-store-catalog.js`
Combines all sources into unified catalog:
- Merges data from all APIs
- Resolves conflicts (prefers IGDB for core data)
- Generates `store_catalog.json`

### `enrich-owned.js`
Enriches your personal collection:
- Looks up each owned game in catalog
- Adds complete metadata
- Updates `owned.json` with rich data

## Usage

### Adding Games to Your Collection
Edit `owned.json`:
```json
[
  {
    "title": "The Legend of Zelda: Breath of the Wild",
    "igdb_id": 7346
  }
]
```

Run enrichment:
```bash
node enrich-owned.js
```

### Managing Wishlist
Edit `wish_list.json` with games you want to track.

### Updating Data
Re-run import scripts periodically to get:
- New game releases
- Updated prices and sales
- Latest review scores

## Development

### Local Server
The included `serve.js` provides:
- Static file serving
- Development hot-reload
- Local-only API endpoints
- Port 5500 by default

### Customization
- Modify `app/app.js` for frontend features
- Update `app/styles.css` for design changes
- Extend import scripts for new data sources

## Deployment

**Status:** Ready for Vercel deployment

Configure Vercel:
1. Import from GitHub
2. Set environment variables (IGDB credentials)
3. Deploy from `main` branch

## API Rate Limits

- **IGDB:** 4 requests/second (free tier)
- **Metacritic:** Rate-limited scraping (respect robots.txt)
- **Nintendo:** Public API (no authentication)

Cache files help minimize API calls.

## Future Enhancements

- [ ] Deploy to Vercel
- [ ] Add price tracking and alerts
- [ ] Sale notifications
- [ ] Game recommendations based on owned titles
- [ ] Friends' collections and sharing
- [ ] Mobile app version
- [ ] Other platforms (PS5, Xbox, PC)

---

**WE3 Venture Studio**
Personal game library management tool.
