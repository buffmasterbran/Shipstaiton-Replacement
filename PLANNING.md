# PLANNING — ShipStation Replacement

> Living document for tracking project status, architecture decisions, and upcoming work.
> Last updated: Feb 5, 2026

---

## Project Overview

A Next.js 14 warehouse management and order fulfillment system that replaces ShipStation. Accepts orders from NetSuite, manages picking/packing workflows, performs rate shopping via ShipEngine, and provides a warehouse-floor UI optimized for iPads.

**Stack:** Next.js 14 (App Router) · React 18 · TypeScript · TailwindCSS · Prisma · Supabase (PostgreSQL) · ShipEngine API

**Deployment:** Vercel + Supabase

---

## Current State (as of Feb 5, 2026)

### What's Built and Working

| Area | Status | Notes |
|------|--------|-------|
| **Order Ingestion** | Done | NetSuite → `/api/ingest-batch` with Basic Auth |
| **All Orders Dashboard** | Done | Real-time refresh, filtering, search, edit/delete |
| **Expedited Orders** | Done | Expedited tab with highlighting |
| **Singles** | Done | Fixed shipping/dimensions, ShipEngine integration |
| **Bulk Orders (Admin)** | Done | Admin queue, chunking to max 24, send to bulk queue |
| **Bulk Verification** | Done | Barcode scanning, quantity confirmation, label printing |
| **Orders by Size** | Done | Dynamic based on box config, confidence filtering |
| **Personalization** | Done | Product customization tracking |
| **International** | Done | International orders tab |
| **Local Pickup** | Done | Local pickup orders tab |
| **Analytics** | Done | Dashboard with metrics |
| **Returns** | Done | Amazon & RMA returns |
| **Inventory Count** | Done | Bridges WHS and ECOM |
| **Orders on Hold** | Done | Quarantine mode, hold reasons, hold duration |
| **Rate Shopping** | Done | Multi-carrier, progress tracking, cancellation, rate shoppers config |
| **Box Config** | Done | Box fitting, product sizes, SKU patterns, feedback rules |
| **Scan to Verify** | Done | Barcode scanning, weight auto-populate, box suggestions |
| **Carrier Management** | Done | Carrier selection for rate shopping |
| **Locations** | Done | Multi-location ship-from addresses |
| **Settings** | Done | App settings management |
| **Digital Picking/Packing** | Done | Cells, batches, chunks (12-order), carts, drag-and-drop queue |
| **Batch Queue** | Done | Drag-and-drop reordering (DRAFT only), priority management |
| **Cart Scanning** | Done | Picker claims chunk via cart scan |
| **Products/SKU Management** | Done | SKU patterns, bin locations, unmatched SKU tracking |

### Recent Milestones

1. **Feb 2, 2026** — Digital Picking & Packing Workflow (major milestone)
   - PickCell, PickBatch, PickChunk, PickCart models
   - 12-bin cart system matching physical carts
   - Batch → Chunk hierarchy (batches hold multiple chunks of 12 orders)
   - Picker/Shipper tracking with duration metrics
2. **Feb 3-5, 2026** — Picking UX Polish
   - iPad screen optimization
   - Cart release UX improvements
   - Batch queue drag-and-drop restricted to DRAFT status
   - Empty cell drag-drop fix

---

## Architecture

### Data Model (Key Entities)

```
OrderLog          — Core order record (40+ fields)
  ├─ batchId      → PickBatch
  ├─ chunkId      → PickChunk
  └─ binNumber    — 1-12 position on cart

PickCell          — Physical warehouse cell (handles specific box sizes)
  └─ PickBatch    — Group of orders assigned to a cell
       └─ PickChunk — 12-order unit assigned to one picker/cart
            └─ PickCart — Physical 12-bin cart

BulkQueueItem     — Admin bulk queue (chunked to max 24 orders)

Box / ProductSize / ProductSku / ProductSkuPattern — Product & box config
BoxFeedbackRule   — Learned corrections for box fitting

RateShopper       — Saved rate comparison configurations
Location          — Ship-from warehouse addresses
UnmatchedSku      — SKUs that don't match any known product
AppSetting        — Key-value app config
```

### Picking/Packing Flow

```
Admin creates PickBatch (assigns orders to a cell)
  → System auto-chunks into PickChunks of 12
  → Batch status: DRAFT → RELEASED → IN_PROGRESS → COMPLETED
  → Picker scans cart → claims a chunk → picks items into bins 1-12
  → Shipper processes chunk → ships orders → marks complete
```

### Key Design Decisions

- **12-bin carts** as the base picking unit (matches physical warehouse carts)
- **Max 24 orders per bulk batch** (limits return label volume and error likelihood)
- **Two-level batching**: PickBatch (cell-level) → PickChunk (cart-level)
- **Drag-and-drop** batch reordering restricted to DRAFT status only
- **iPad-first UI** for warehouse floor workers
- **Role-based access**: Admin vs. regular user (Bulk Orders admin-only, etc.)

### API Routes

| Route | Purpose |
|-------|---------|
| `/api/ingest-batch` | NetSuite order ingestion |
| `/api/orders/*` | Order CRUD, status updates, hold management |
| `/api/orders-by-numbers` | Batch order lookup by order numbers |
| `/api/batches` | Pick batch management |
| `/api/cells` | Pick cell management |
| `/api/carts` | Cart status and management |
| `/api/pick/*` | Picking workflow (claim, progress, complete) |
| `/api/ship/*` | Shipping workflow |
| `/api/bulk-queue` | Bulk queue management |
| `/api/scan-to-verify` | Barcode verification |
| `/api/shipengine/*` | ShipEngine rate shopping and labels |
| `/api/shipstation` | Legacy ShipStation compatibility |
| `/api/box-config` | Box and product config |
| `/api/rate-shoppers` | Rate shopper configurations |
| `/api/locations` | Ship-from locations |
| `/api/products` | Product/SKU management |
| `/api/settings` | App settings |
| `/api/metrics` | Performance metrics |
| `/api/debug` | Debug utilities |

---

## What's Next — Planned Work

### Phase 7: Session Management (Current Phase)

Identified in commit `17f6007`. Focus on improving cart release UX and session-based workflow optimization.

**Goals:**
- Session tracking for pickers/shippers (who's working on what)
- Improved cart release flow (return carts to available when done)
- Better visibility into active sessions across the warehouse

### Upcoming Features / Improvements

These items come from `new_features.ini`, existing feature specs, and commit history. Prioritize based on warehouse needs.

#### High Priority

- [ ] **Session management** — Track active picker/shipper sessions, auto-release idle carts, show who's working on what
- [ ] **Expedited auto-ship same day** — Flag set by Customer Service, auto-prioritize for same-day shipping
- [ ] **Late order highlighting** — Visual indicators for orders approaching or past their ship-by date (similar to NetSuite saved search)
- [ ] **Date filtering on All Orders** — Filter orders by date range

#### Medium Priority

- [ ] **Bulk singles flow refinement** — Select size → set threshold → process, with confirmation dialog warning about NetSuite IF status changes
- [ ] **Personalization expedited highlighter** — Add expedited order highlighting to Personalization tab
- [ ] **Analytics expansion** — Bulk package analytics, customization analytics, picking/shipping performance dashboards
- [ ] **Label management** — Delete labels from shipped orders, label reprinting

#### Lower Priority

- [ ] **Accessories** — Status TBD/Unclear from planning doc, needs requirements definition
- [ ] **Inventory count improvements** — Better WHS ↔ ECOM bridging
- [ ] **Address validation improvements** — Enhanced validation and correction workflows
- [ ] **Customer notification system** — Email notifications for order status changes

#### Technical Debt / Polish

- [ ] **Error handling consistency** — Standardize error responses across all API routes
- [ ] **Loading states** — Consistent loading/skeleton states across all pages
- [ ] **Offline resilience** — Handle network drops gracefully on warehouse floor iPads
- [ ] **Performance** — Optimize queries for large order volumes (1000+ orders)
- [ ] **Testing** — Add integration tests for critical workflows (picking, shipping, rate shopping)

---

## Feature Spec Index

Detailed feature specs live in `/docs/`:

| Doc | Topic |
|-----|-------|
| `FEATURE-01-BULK-BATCHED-VERIFICATION-AND-24-MAX.md` | Bulk verification with 24-order max |
| `NETSUITE_INTEGRATION.md` | NetSuite order ingestion |
| `AUTHENTICATION.md` | Auth setup |
| `DEPLOYMENT.md` | Deployment guide |
| `CLI_DEPLOYMENT.md` | CLI deployment |
| `VERCEL_DEPLOY.md` | Vercel deployment |
| `VERCEL_ENV_SETUP.md` | Vercel environment variables |
| `SUPABASE_CONNECTION.md` | Supabase database setup |
| `ENV_SETUP.md` | Local environment setup |
| `QUICK_START.md` | Quick start guide |
| `NEXT_STEPS.md` | Getting the API live |

---

## Global Rules (from `new_features.ini`)

1. **Bulk batched orders require verification** — barcode scan + quantity confirm before label print
2. **Max 24 orders per packer batch** — large groups chunked into batches of 24
3. **Max 5 items per bulk order** — too many items increase error likelihood
4. **Bulk Orders are admin-only** — admin sends to queue, packers work from queue
5. **Rate shopping uses ShipEngine** — not ShipStation
6. **Singles auto-rate** — pricing starts immediately when order enters system

---

## How to Use This File

- Update the "Current State" table as features ship
- Add new items to "What's Next" as requirements emerge
- Move completed "What's Next" items into "Current State"
- Create detailed feature specs in `/docs/FEATURE-XX-*.md` for complex features
- Reference this file at the start of any development session for context
