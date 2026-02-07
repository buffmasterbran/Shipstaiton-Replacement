---
name: Digital Picking Workflow
overview: Fully digital warehouse picking, packing, and shipping workflow with three picking modes (Singles, Bulk, Order by Size), unified batch queue with multi-cell assignment, mode-specific iPad picker interface with timer, mode-aware shipping verification, personalized order engraving flow, and packing slip fallback.
todos:
  - id: phase-1-db
    content: "Phase 1: Database migration - new models (User, BatchCellAssignment, BulkBatch), modified models (PickBatch, PickChunk, OrderLog, PickCell), new enums (BatchType, PickingMode, UserRole)"
    status: completed
  - id: phase-2-classifier
    content: "Phase 2: Order classification engine - classifyOrders, computeOrderSignature, splitBulkGroup, buildBulkSkuLayout"
    status: completed
  - id: phase-3-admin
    content: "Phase 3: Admin tabs overhaul - Singles, Bulk Orders, Orders by Size rewritten with Push to Queue and packing slip fallback"
    status: completed
  - id: phase-4-queue
    content: "Phase 4: Batch Queue overhaul - multi-cell columns, Queue Summary at top, type badges, shared batch support, drag-to-reorder"
    status: completed
  - id: phase-5-picker
    content: "Phase 5: Picker interface overhaul - login, mode-specific picking (Singles/Bulk/OBS), timer with pause/resume, personalized completion flow"
    status: completed
  - id: phase-6-shipping
    content: "Phase 6: Shipping verification overhaul - mode-specific (Singles: 1-scan + 20% spot check, Standard: full scan per item)"
    status: completed
  - id: phase-7-personalized
    content: "Phase 7: Personalized order flow - READY_FOR_ENGRAVING status, engraving station UI, cart ENGRAVING status, staging zone"
    status: completed
  - id: phase-8-settings
    content: "Phase 8: Settings - SKU display names reference, picking configuration display"
    status: completed
  - id: phase-9-fallback
    content: "Phase 9: Packing slip fallback button on all admin tabs"
    status: completed
  - id: bulk-multi-select
    content: "Enhancement: Multi-select bulk groups with checkboxes to push selected groups to queue"
    status: pending
  - id: phase-10-edit-cells
    content: "Phase 10: Edit cell assignments from batch queue tiles"
    status: completed
  - id: phase-11-cleanup
    content: "Phase 11: Remove Bulk Verification, fix claim-chunk API, drop Personalization external link, add Pick Personalized shortcut"
    status: completed
  - id: phase-12-pers-tab
    content: "Phase 12: Dedicated Personalized Orders tab, separate personalized batch pool, exclude from other tabs"
    status: completed
isProject: false
---

# Digital Picking & Packing Workflow (V2 Overhaul)

## Overview

This system provides a fully digital warehouse workflow replacing paper-based packing slips:

1. **Admin** pushes orders to the Batch Queue from three tabs (Singles, Bulk Orders, Orders by Size)
2. **Pickers** (iPad) log in, select cell + cart, pick items by warehouse location with timer
3. **Shippers** (Desktop) scan carts, verify items (mode-specific), print labels
4. **Engravers** (personalized orders only) engrave items between picking and shipping
5. **Fallback** packing slips available on all admin tabs if the system fails

---

## Three Order Types / Picking Modes

### Singles
- **Definition**: 1 item per order (cups, accessories, stickers - anything)
- **Admin tab**: `/singles` - Size filter buttons with counts, Variation filter, SKU grouping summary
- **Picking**: 1 SKU per bin, all units of that SKU in the same bin (max 24/bin). Up to 12 SKU groups per cart = up to 288 orders per cart
- **Shipping**: Scan 1 item to verify + 20% random spot checks, print ALL labels per bin at once
- **Threshold**: If an individual SKU has >24 orders, it stays in Singles (multiple bins)

### Bulk Orders
- **Definition**: 4+ exact duplicate orders (identical SKU combinations), 2-4 items per order max
- **Admin tab**: `/bulk` - Threshold slider (4-200+), box size filter, identical order grouping, Push Group per group + Push All
- **Picking**: Pre-grouped bulk batches. 1 bin = 1 master unit (SKU instance), qty in bin = number of orders. Max 24 orders per chunk (split if exceeded, balanced). 3 chunks per cart (1 per shelf), 4 bins per shelf
- **Shipping**: Full per-item scan verification, 1 order at a time

### Orders by Size
- **Definition**: Multi-item orders (2+ items) that don't qualify as Bulk
- **Admin tab**: `/box-size` - Two-tier filtering (box size, then cup size), identical order count, checkbox selection
- **Picking**: 1 order per bin, 12 orders per cart
- **Shipping**: Full per-item scan verification

### Personalized Orders
- **Flag**: `isPersonalized` on OrderLog (detected during ingestion from NetSuite)
- **Admin tab**: `/personalized-orders` - Dedicated tab showing only personalized orders with box/cup filters and engraving text column
- **Batch pool**: Personalized batches live in their own pool (no cell assignment), shown as separate "Personalized" column in Batch Queue
- **Picking**: Always 1-per-bin (like OBS). Any picker can grab from the pool via "Pick Personalized Cart" button. Cart goes to engraving instead of shipping.
- **Engraving**: `/personalization` (Engraving Station) - Engraver station with login, queue, order-by-order engraving text display
- **Shipping**: After engraving, cart moves to shipping station
- **Exclusion**: Personalized orders are excluded from Singles, Bulk, and Orders by Size tabs entirely

---

## Database Schema (Key Changes in V2)

### New Models
- **User**: `id, name, pin, role (ADMIN|PICKER|SHIPPER|ENGRAVER), active`
- **BatchCellAssignment**: `id, batchId, cellId, priority` - Many-to-many batch↔cell assignment
- **BulkBatch**: `id, parentBatchId, groupSignature, orderCount, splitIndex, totalSplits, skuLayout, status`

### Modified Models
- **PickBatch**: Added `type (SINGLES|BULK|ORDER_BY_SIZE)`, `isPersonalized`, `engravedOrders`. `cellId` nullable (legacy). Multi-cell via `cellAssignments[]`
- **PickChunk**: Added `pickingMode`, `isPersonalized`, `pickerId`, `shipperId`
- **OrderLog**: Added `bulkBatchId`, `isPersonalized`
- **PickCell**: Added `cellAssignments[]` relation

### New/Modified Enums
- **BatchType**: `SINGLES | BULK | ORDER_BY_SIZE`
- **PickBatchStatus**: Added `ACTIVE` (replaces DRAFT/RELEASED for new batches)
- **PickChunkStatus**: Added `READY_FOR_ENGRAVING`, `READY_FOR_SHIPPING`
- **PickCartStatus**: Added `ENGRAVING`

### Migration Files
- `prisma/migrations/v2_picking_overhaul.sql` - Main schema changes (run in 2 parts for enum safety)
- `prisma/migrations/v2b_engraving_statuses.sql` - Additional enum values for engraving flow

---

## Key Files

### Order Classification
- **`lib/order-classifier.ts`** - Core classification engine
  - `classifyOrders()` - Categorizes orders into SINGLE, BULK, ORDER_BY_SIZE, PERSONALIZED
  - `computeOrderSignature()` - Creates comparable signature for identical order matching
  - `splitBulkGroup()` - Balanced splitting of large bulk groups (e.g., 30 → [15, 15])
  - `buildBulkSkuLayout()` - Generates bin layout for bulk picking

### API Routes
- **`app/api/batches/route.ts`** - Batch CRUD
  - POST: Creates batch with multi-cell assignment, bulk batch splitting
  - GET: Lists batches with cellAssignments and bulkBatches
  - PATCH: Update batch status/priority
  - DELETE: Cascading delete of assignments and bulk batches
- **`app/api/batches/reorder/route.ts`** - Drag-to-reorder within cells
- **`app/api/batches/cells/route.ts`** - Edit cell assignments (add/remove cells from a batch)
- **`app/api/pick/route.ts`** - Picker actions
  - GET: `active-cells`, `available-carts`, `engraving-queue`
  - POST: `claim-chunk`, `complete-chunk` (routes personalized to engraving), `out-of-stock`, `cancel-chunk`, `mark-engraved`, `complete-engraving`
- **`app/api/ship/route.ts`** - Shipping verification actions
- **`app/api/ingest-batch/route.ts`** - Extracts `isPersonalized` flag during NetSuite ingestion

### Admin Tab Components
- **`components/SinglesOrdersTable.tsx`** - Size/variation filters with counts, SKU grouping summary, Push to Queue, packing slip fallback. Excludes personalized orders.
- **`components/BulkOrdersTable.tsx`** - Threshold slider, identical order grouping, Push Group/Push All, packing slip fallback. Excludes personalized orders.
- **`components/BoxSizeSpecificTable.tsx`** - Two-tier box/cup filtering, identical count column, checkbox selection, Push to Queue, packing slip fallback. Excludes personalized orders.
- **`components/PersonalizedOrdersTable.tsx`** - Dedicated tab for personalized orders. Box/cup filters, engraving text column, inline push to personalized queue (no cell selection), packing slip fallback.
- **`components/PushToQueueDialog.tsx`** - Shared dialog for cell selection and batch naming
- **`components/PackingSlipButton.tsx`** - Shared packing slip fallback component

### Warehouse Pages
- **`app/batch-queue/page.tsx`** - Queue Summary at top, cell columns with batch tiles (type badge, shared badge, progress bar, pick/ship remaining), drag-to-reorder, show/hide completed
- **`app/pick/page.tsx`** - Picker interface: login → cell select → cart select → picking (mode badge, timer, product info, location-based) → complete (routes personalized to engraving)
- **`app/cart-scan/page.tsx`** - Shipping: cart select → mode-specific verification (Singles: 1-scan + spot check; Standard: full scan) → label printing → complete
- **`app/personalization/page.tsx`** - Engraving station: login → queue → order-by-order engraving text display → complete

---

## Batch Queue Behavior

- Batches are pushed from admin tabs with cell assignment (1 or more cells)
- Shared batches appear in multiple cell columns with "Shared" badge
- Priority is per-cell (drag to reorder within each cell independently)
- Batches go: ACTIVE → IN_PROGRESS (when picker claims chunk) → COMPLETED (when all shipped)
- Queue Summary shows: Total Orders, Awaiting Pick, Awaiting Ship, Shipped, breakdown by type
- Auto-refresh every 30 seconds
- Delete button on active batches (returns orders to admin tabs)

---

## Picking Flow

1. Picker logs in (name saved to localStorage)
2. Selects cell → sees available orders count. "Pick Personalized Cart" shortcut available to detour to personalized cell at any time
3. Selects cart → system creates chunk (12 orders for OBS, up to 24 for Singles, 3 shelves for Bulk). Can also "Switch to Personalized Cart" from here
4. Pick screen shows: mode badge, timer, location, SKU, product size/color, quantity, bin distribution
5. Items sorted by warehouse bin location to minimize walking
6. "Out of Stock" returns affected orders to queue
7. On completion:
   - Standard: cart → shipping station
   - Personalized: cart → engraving staging zone (READY_FOR_ENGRAVING status)

---

## Shipping Verification Flow

### Singles Carts
1. System shows bin number and expected SKU
2. Shipper scans 1 item to verify correct SKU
3. 20% chance of spot check (scan another random item)
4. Print ALL labels for the bin at once
5. Move to next bin

### Standard Carts (Bulk, Order by Size)
1. System shows order number and bin number
2. Shipper scans each item against expected quantities
3. All items verified → print label
4. Move to next order/bin

---

## Personalized Flow

1. Orders flagged `isPersonalized` during NetSuite ingestion
2. Picked normally but chunk status → READY_FOR_ENGRAVING
3. Cart status → ENGRAVING, placed in staging zone
4. Engraver at `/personalization`: sees queue, starts engraving, sees text per order
5. After all orders engraved: chunk → READY_FOR_SHIPPING, cart available for shipping
6. Shipper processes normally

---

## Settings

- **Cells**: Add/remove/toggle active picking cells (A, B, C, Personalized, etc.)
- **Carts**: Add/remove/toggle carts with color coding
- **SKU Display Names**: Reference table (LID-AT → Air-tight Lid, etc.)
- **Picking Config**: Max items/bin (24 standard, 9 water bottles), bins/cart (12), shelves for bulk (3), spot-check rate (20%), bulk threshold (configurable via slider, min 4)

---

## Batch Queue - Edit Cell Assignments (Phase 10)

- **"Cells" button** on each batch tile (visible when not IN_PROGRESS or COMPLETED)
- Opens inline cell editor showing toggle buttons for all cells
- Toggling a cell adds/removes a `BatchCellAssignment` record via `PUT /api/batches/cells`
- Cannot remove the last cell (enforced in both UI and API)
- New cells get appended at the bottom of the target cell's queue
- Files changed:
  - `app/batch-queue/page.tsx` — `SortableBatchCard` + `CellColumn` updated with `onEditCells` / `allCells` props
  - `app/api/batches/cells/route.ts` — New API route for updating cell assignments

---

## Phase 11: Cleanup & Fixes

### Removed: Bulk Verification Tab
- Deleted `app/bulk-verification/page.tsx` and `components/BulkVerificationDialog.tsx`
- Removed sidebar entry from `components/Sidebar.tsx`
- Updated operator default redirect in `components/MainLayout.tsx` from `/bulk-verification` to `/pick`
- Added `/pick` and `/cart-scan` to operator allowed paths

### Fixed: claim-chunk API (pick/route.ts)
- **GET handler**: Now queries batches via `BatchCellAssignment` (instead of `pickBatch.cellId`), ordered by assignment priority. Filters by `ACTIVE`, `IN_PROGRESS`, and `RELEASED` statuses.
- **POST claim-chunk**: Finds next batch via `BatchCellAssignment.priority` instead of `PickBatch.priority`. Shared batches now correctly appear in all assigned cells. Handles `ACTIVE` status (transitions to `IN_PROGRESS` on first chunk claim).

### Fixed: Personalization Sidebar Link
- Removed `externalHref` from Personalization nav item in `components/Sidebar.tsx`
- Now routes to the internal `/personalization` engraving station page

### Added: Pick Personalized Shortcut (pick/page.tsx)
- Cell-select screen: Regular cells shown in grid, "Pick Personalized Cart" button shown below with order count (purple, disabled when 0 orders)
- Cart-select screen: "Switch to Personalized Cart" button available when picker is not already picking personalized
- After completing a personalized detour, picker automatically returns to their original cell
- Uses `returnToCell` state to track the cell the picker was in before the detour

---

## Phase 12: Dedicated Personalized Orders Tab

### Problem
Personalized orders are always 1-per-bin (for engraving), incompatible with Singles (multi-per-bin) and Bulk (qty = order count per bin). They needed their own admin tab and batch pool.

### New: Personalized Orders Admin Tab
- **`app/personalized-orders/page.tsx`** -- Wrapper page
- **`components/PersonalizedOrdersTable.tsx`** -- Modeled after BoxSizeSpecificTable
  - Shows only orders where `isOrderPersonalized()` is true and not yet batched
  - Filters: box size (tier 1), cup size (tier 2), search (also searches engraving text)
  - "Engraving" column shows engraving text for each order
  - Inline "Push to Personalized Queue" button with optional batch name (no cell selection needed)
  - Packing slip fallback button
  - Purple color theme

### Personalized Orders Excluded from Other Tabs
- `SinglesOrdersTable`, `BulkOrdersTable`, `BoxSizeSpecificTable`: Now filter out `isOrderPersonalized()` orders at the processing step
- `personalizedFilter` toggle removed from Header (no longer needed)

### Personalized Batch Pool (No Cell Assignment)
- **Batch Queue**: Separate "Personalized" column on the right (purple-themed) shows personalized batches
- **`app/api/batches/route.ts`**: `cellIds` can be empty for personalized batches. Uses `PRS-` name prefix. Priority managed independently via `getNextPersonalizedPriority()`
- **`app/api/batches/cells/route.ts`**: Personalized batches have no `BatchCellAssignment` records

### Personalized Picking (Cell-Independent)
- **`app/api/pick/route.ts`**: `claim-chunk` accepts `personalized: true` flag. Finds next personalized batch from pool (no cell assignment, ordered by priority). New `personalized-count` GET action for picker UI.
- **`app/pick/page.tsx`**: "Pick Personalized Cart" button on cell-select and cart-select screens. Uses `pickingPersonalized` state flag instead of looking for a cell named "Personalized". After completing, returns picker to their original cell.

### Sidebar Changes
- Added "Personalized Orders" under Operations (between Orders by Size and International)
- Renamed "Personalization" to "Engraving Station" under Warehouse section
