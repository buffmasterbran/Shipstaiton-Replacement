---
name: Digital Picking Workflow
overview: Implement a digital picking and packing workflow with automatic order categorization (standard 1-12 items, oversized 13-24 items, print-only 25+ items), batch management with drag-drop queue, iPad picker interface, and desktop shipping verification.
todos:
  - id: batch-api
    content: Create /api/batches route with POST, GET, PATCH, DELETE
    status: completed
  - id: batch-create-ui
    content: Add order selection + Add to Batch button to Order by Size tab
    status: completed
  - id: batch-modal
    content: Create batch creation modal with cell selection and auto-categorization
    status: completed
  - id: batch-queue-page
    content: Create /batch-queue page with cell columns and drag-drop
    status: completed
  - id: picker-ui
    content: "Phase 3: Create /pick page for iPad pickers"
    status: completed
  - id: cart-scan
    content: "Phase 4: Create /cart-scan page for shipping verification"
    status: completed
  - id: metrics
    content: "Phase 5: Add picking/shipping metrics to analytics"
    status: completed
  - id: cart-release
    content: "Phase 6: Admin cart release + Picker chunk cancellation"
    status: completed
  - id: session-management
    content: "Phase 7: Session management, heartbeat, stuck cart recovery"
    status: pending
isProject: false
---

# Digital Picking & Packing Workflow

## Overview

This system replaces paper-based packing slips with a fully digital workflow:

1. **Admin** creates batches from orders, assigns to cells
2. **Pickers** (iPad) claim carts, pick items by location, fill bins
3. **Shippers** (Desktop) scan carts, verify items, print labels
4. **Analytics** track performance metrics

---

## Database Models

### PickCell

Physical picking stations in the warehouse. Each cell has shelves, carts, and ship stations.


| Field     | Type          | Description                      |
| --------- | ------------- | -------------------------------- |
| id        | String (cuid) | Primary key                      |
| name      | String        | Display name (e.g., "Cell 1")    |
| active    | Boolean       | Whether cell accepts new batches |
| createdAt | DateTime      | When created                     |


**Relationships:**

- Has many `PickBatch` (batches assigned to this cell)

### PickCart

Physical carts with bins that pickers fill with orders.


| Field     | Type           | Description                     |
| --------- | -------------- | ------------------------------- |
| id        | String (cuid)  | Primary key                     |
| name      | String         | Display name (e.g., "Cart A")   |
| color     | String?        | Visual identifier color         |
| status    | PickCartStatus | AVAILABLE, IN_USE, PICKED_READY |
| active    | Boolean        | Whether cart is usable          |
| createdAt | DateTime       | When created                    |


**Relationships:**

- Has many `PickChunk` (chunks that used this cart)

**Status Flow:**

```
AVAILABLE → IN_USE (picker claims) → PICKED_READY (picking done) → AVAILABLE (shipping done)
     ↑                                      |
     └──────────────────────────────────────┘ (admin release or cancel)
```

### PickBatch

A group of orders to be picked, assigned to a specific cell.


| Field           | Type            | Description                            |
| --------------- | --------------- | -------------------------------------- |
| id              | String (cuid)   | Primary key                            |
| name            | String          | Auto-generated (S-001, O-001)          |
| cellId          | String          | Which cell processes this batch        |
| status          | PickBatchStatus | DRAFT, PENDING, IN_PROGRESS, COMPLETED |
| priority        | Int             | Order in queue (lower = first)         |
| totalOrders     | Int             | Number of orders in batch              |
| ordersCompleted | Int             | Orders fully shipped                   |
| createdAt       | DateTime        | When created                           |


**Relationships:**

- Belongs to `PickCell`
- Has many `OrderLog` (orders in this batch)
- Has many `PickChunk` (chunks created from this batch)

**Status Flow:**

```
DRAFT → PENDING (released) → IN_PROGRESS (first chunk claimed) → COMPLETED (all orders shipped)
```

### PickChunk

A subset of orders from a batch, assigned to one cart for picking/shipping.


| Field           | Type            | Description                                     |
| --------------- | --------------- | ----------------------------------------------- |
| id              | String (cuid)   | Primary key                                     |
| batchId         | String          | Parent batch                                    |
| chunkNumber     | Int             | Sequential number within batch                  |
| cartId          | String          | Which cart is used                              |
| status          | PickChunkStatus | PICKING, PICKED, SHIPPING, COMPLETED, CANCELLED |
| pickerName      | String?         | Who picked this chunk                           |
| shipperName     | String?         | Who shipped this chunk                          |
| ordersInChunk   | Int             | Number of orders assigned                       |
| ordersSkipped   | Int             | Orders returned to queue (OOS)                  |
| ordersShipped   | Int             | Orders successfully shipped                     |
| pickStartedAt   | DateTime?       | When picking began                              |
| pickCompletedAt | DateTime?       | When picking finished                           |
| shipStartedAt   | DateTime?       | When shipping began                             |
| shipCompletedAt | DateTime?       | When shipping finished                          |
| createdAt       | DateTime        | When created                                    |


**Relationships:**

- Belongs to `PickBatch`
- Belongs to `PickCart`
- Has many `OrderLog` (orders in this chunk)

**Status Flow:**

```
PICKING → PICKED (picker done) → SHIPPING (shipper starts) → COMPLETED (all shipped)
    |                                                              
    └→ CANCELLED (picker cancels or admin releases cart)
```

### OrderLog Extensions

Added fields to track picking/shipping:


| Field     | Type    | Description                         |
| --------- | ------- | ----------------------------------- |
| batchId   | String? | Which batch this order belongs to   |
| chunkId   | String? | Which chunk (if currently assigned) |
| binNumber | Int?    | Which bin on the cart (1-12 or 1-6) |


### ProductSku Extensions


| Field       | Type    | Description                      |
| ----------- | ------- | -------------------------------- |
| binLocation | String? | Warehouse location (e.g., "A11") |


---

## Phase 1: Foundation (COMPLETE)

### 1.1 Database Schema

- Created all models above in `prisma/schema.prisma`
- Manual SQL migration in `prisma/migrations/picking_workflow.sql`

### 1.2 Settings Page - Cell Management

Location: `app/settings/page.tsx`

**Features:**

- List all cells with active status
- Add new cell (name only, all cells are identical)
- Toggle cell active/inactive
- Delete cell (only if no batches assigned)

**API:** `app/api/cells/route.ts`

- `GET` - List all cells
- `POST` - Create cell `{ name: string }`
- `PATCH` - Update cell `{ id, active?: boolean }`
- `DELETE` - Delete cell `{ id }` (fails if batches exist)

### 1.3 Settings Page - Cart Management

Location: `app/settings/page.tsx`

**Features:**

- List all carts with status and color
- Add new cart (name, optional color)
- Toggle cart active/inactive
- Delete cart (only if never used)
- **NEW: Release cart button** (see Phase 6)

**API:** `app/api/carts/route.ts`

- `GET` - List all carts
- `POST` - Create cart `{ name: string, color?: string }`
- `PATCH` - Update cart `{ id, active?: boolean, status?: string }`
- `DELETE` - Delete cart `{ id }` (fails if has chunks)

### 1.4 Products Page - Bin Location

Location: `app/products/page.tsx`

**Features:**

- Added "Bin Location" field to SKU form
- Displays bin location in SKU table
- Used to sort pick items by warehouse location

---

## Phase 2: Batch Management (COMPLETE)

### 2.1 Order Selection - Order by Size Tab

Location: `components/BoxSizeSpecificTable.tsx`

**Features:**

- Checkbox column for selecting orders
- "Select All" checkbox in header (only selects orders not already in a batch)
- Orders already in a batch show clipboard icon and are non-selectable
- "In Batch" badge displays on batched orders
- "Add to Batch" button appears when orders are selected

**Order Categorization (automatic):**

```
Item Count 1-12:   → Standard batch (12 orders per chunk)
Item Count 13-24:  → Oversized batch (6 orders per chunk)
Item Count 25+:    → Print-only (excluded, notification shown)
```

### 2.2 Add to Batch Dialog

Location: `components/AddToBatchDialog.tsx`

**Flow:**

1. User selects orders and clicks "Add to Batch"
2. Dialog shows breakdown: X standard, Y oversized, Z print-only
3. User selects target cell from dropdown
4. Click "Create Batch(es)"
5. API creates batches and assigns orders
6. Summary shows: "Created Batch S-001 with 48 orders, Batch O-001 with 12 orders, 3 orders excluded"

**API:** `POST /api/batches`

```typescript
Request: {
  orderIds: string[]
  cellId: string
}

Response: {
  batches: [
    { id, name, orderCount, type: 'standard' | 'oversized' }
  ],
  excluded: {
    count: number,
    reason: 'print_only'
  }
}
```

### 2.3 Batch Queue Page

Location: `app/batch-queue/page.tsx`

**Layout:**

- Side-by-side columns, one per active cell
- Each column header shows cell name
- Batches displayed as cards within columns
- Drag handle for reordering

**Batch Card Display:**

- Drag handle (only for DRAFT batches) or lock icon (for released/in-progress)
- Batch name (S-001, O-001)
- Type badge (Standard / Oversized)
- Order count (e.g., "48 orders")
- Progress bar (ordersCompleted / totalOrders)
- Status badge (DRAFT, PENDING, IN_PROGRESS, COMPLETED)

**Drag & Drop (using @dnd-kit):**

- **Only DRAFT batches can be dragged** - Released or In Progress batches are locked to their cell
- Drag within column: reorders priority (lower number = picked first)
- Drag between columns: moves batch to different cell
- Drop triggers API call to update
- Non-draggable batches show a lock icon instead of drag handle

**Actions per Batch:**

- "Release" button (DRAFT → PENDING, makes available for pickers)
- "Delete" button (only DRAFT, returns orders to unbatched)

**API:** `POST /api/batches/reorder`

```typescript
Request: {
  batchId: string
  newCellId?: string      // if moving between cells
  newPriority: number     // new position in queue
}
```

---

## Phase 3: Picker Interface - iPad (COMPLETE)

Location: `app/pick/page.tsx`

### 3.1 Picker Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Select Cell    │ ──► │  Select Cart    │ ──► │    Picking      │
│                 │     │  + Enter Name   │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                              ┌──────────────────────────┤
                              │                          │
                              ▼                          ▼
                    ┌─────────────────┐        ┌─────────────────┐
                    │  Cart Complete  │        │ Cancel / Exit   │
                    │  (take to ship) │        │ (return orders) │
                    └─────────────────┘        └─────────────────┘
```

### 3.2 Cell Selection Screen

- Shows all active cells as large tap targets
- Displays order count waiting in each cell
- Tap to select and proceed

### 3.3 Cart Selection Screen

- Input field for picker's name (saved to localStorage)
- Grid of available carts (status = AVAILABLE)
- Each cart shows name and color indicator
- "Start Picking" button claims a chunk

**Claim Chunk Process:**

1. Find highest-priority PENDING or IN_PROGRESS batch in selected cell
2. Determine chunk size: 12 for standard, 6 for oversized
3. Select next N unassigned orders from batch
4. Create `PickChunk` record with status PICKING
5. Assign orders to chunk with bin numbers (1-12 or 1-6)
6. Sort orders by binLocation for efficient picking
7. Update cart status to IN_USE
8. Update batch status to IN_PROGRESS if first chunk

### 3.4 Picking Screen - Location-Based

**Header:**

- Batch name and cart name
- Progress: "Item X of Y"

**Main Instruction Panel (blue background):**

- "GO TO LOCATION" label
- Large location code (e.g., "A11")
- SKU code and item name

**Cart Visualization (4×3 or 3×2 grid):**

- Shows all bins
- Highlighted bins = need items from current location
- Each highlighted bin shows: location, quantity, bin number
- Green bins = all items picked
- Gray bins = emptied due to OOS

**Quantity Summary:**

- Large number: total items to grab
- If multiple bins: distribution list (Bin 1: ×2, Bin 6: ×1)

**Actions:**

- "Continue" button → advance to next location
- "Mark Out of Stock" button → see OOS handling below

### 3.5 Out of Stock Handling

When picker taps "Out of Stock":

1. Confirmation dialog: "Mark [SKU] as out of stock? This will empty X bin(s)."
2. If confirmed:
  - Find all bins that have orders needing this SKU
  - Unassign those orders from chunk (set chunkId = null, binNumber = null)
  - Orders remain in batch, available for next chunk
  - Increment `ordersSkipped` on chunk
  - Mark those bins as "empty" in UI
3. Advance to next location
4. If all locations done, complete chunk

### 3.6 Chunk Completion

When all locations are picked (or skipped):

1. Update chunk status to PICKED
2. Record `pickCompletedAt` timestamp
3. Calculate pick duration
4. Update cart status to PICKED_READY
5. Show "Cart Complete!" screen
6. Options: "Pick Another Cart" or "Change Cell"

### 3.7 Chunk Cancellation (NEW - Phase 6)

See Phase 6 for detailed cancellation flow.

---

## Phase 4: Shipping Interface - Desktop (COMPLETE)

Location: `app/cart-scan/page.tsx`

### 4.1 Shipper Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Select Cart    │ ──► │  Verify Items   │ ──► │  Cart Complete  │
│  + Enter Name   │     │  (per order)    │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 4.2 Cart Selection Screen

- Input for shipper name (saved to localStorage)
- Scan input for cart barcode
- List of carts with status PICKED_READY
- Each shows cart name, color, order count

**Start Shipping Process:**

1. Fetch cart with its chunks and orders
2. Update chunk status to SHIPPING
3. Record `shipStartedAt` timestamp
4. Identify empty bins (orders that were skipped during picking)

### 4.3 Order Verification Screen

**Header:**

- Cart name and shipper name
- Progress: "Order X of Y"

**Cart Visualization:**

- Same 4×3 or 3×2 grid as picker
- Current bin highlighted in blue
- Shipped bins in green with checkmark
- Empty bins in gray with dash

**Order Panel:**

- Order number
- Current bin number
- Scan input field (auto-focused)

**Item List:**

- Each item shows: SKU, name, expected qty, scanned qty
- Green = fully scanned
- Amber = over-scanned (warning)
- White = pending

**Scanning Logic:**

```
Scan barcode → 
  If matches item SKU:
    Increment scanned count
    If count > expected: Show "Warning: Expected X, scanned Y"
  If no match:
    Show "Not in this order" error
```

### 4.4 Label Printing

When all items verified:

1. "Print Label" button becomes active
2. Click triggers label generation (ShipEngine integration)
3. Show "Label printed successfully" confirmation
4. "Next Order" button becomes active

### 4.5 Order Completion

When "Next Order" clicked:

1. Mark order as SHIPPED in OrderLog
2. Store tracking number
3. Increment `ordersShipped` on chunk
4. Advance to next bin
5. If empty bin: show message, auto-advance

### 4.6 Cart Completion

When all orders shipped:

1. Update chunk status to COMPLETED
2. Record `shipCompletedAt` timestamp
3. Calculate ship duration
4. Check if all chunks in batch are complete
5. If yes: update batch status to COMPLETED
6. Update cart status to AVAILABLE
7. Show "Cart Complete!" screen with stats

---

## Phase 5: Analytics (COMPLETE)

Location: `app/analytics/page.tsx`

### 5.1 Metrics API

Location: `app/api/metrics/picking/route.ts`

**Query Parameters:**

- `period`: 'today' | 'week' | 'month'

**Response:**

```typescript
{
  summary: {
    totalChunks: number
    totalOrders: number
    totalPicked: number
    totalShipped: number
    totalSkipped: number
    problemRate: number  // skipped / total
  },
  picking: {
    avgDurationMinutes: number
    ordersPerHour: number
    topPickers: [{ name, chunks, orders, avgMinutes }]
  },
  shipping: {
    avgDurationMinutes: number
    ordersPerHour: number
    topShippers: [{ name, chunks, orders, avgMinutes }]
  },
  batches: {
    pending: number
    inProgress: number
    completed: number
  }
}
```

### 5.2 Analytics Dashboard

**Period Filter:** Today / This Week / This Month

**Batch Status Cards:**

- Pending batches count
- In Progress batches count
- Completed batches count

**Picking Performance:**

- Average chunk duration
- Orders per hour
- Top pickers leaderboard (name, chunks, orders, avg time)

**Shipping Performance:**

- Average order ship time
- Orders per hour
- Top shippers leaderboard (name, orders, avg time)

---

## Phase 6: Cart Release & Chunk Cancellation (NEW)

### 6.1 Problem Scenarios

**Scenario A: Picker needs to stop mid-pick**

- Picker started a chunk but needs to leave
- Cart has partially picked items
- Need to "undo" the pick and return orders to queue

**Scenario B: Cart is stuck**

- Picker walked away, cart shows IN_USE
- Admin needs to release cart so it can be used again

**Scenario C: Technical issue**

- System error during picking
- Need to reset cart and chunk state

### 6.2 Picker Cancellation (from /pick page)

**Trigger Points:**

1. Picker taps "Cancel Pick" button during picking
2. Picker tries to navigate away (browser back, close tab, go to another page)
3. Picker taps "Change Cell" during picking

**Cancellation Dialog:**

```
┌─────────────────────────────────────┐
│     Cancel This Pick?               │
│                                     │
│  The cart will be released and      │
│  all orders will return to the      │
│  batch queue.                       │
│                                     │
│  Any items already in the cart      │
│  should be returned to shelves.     │
│                                     │
│  [Keep Picking]    [Cancel Pick]    │
└─────────────────────────────────────┘
```

**Cancellation Process:**

1. Update chunk status to CANCELLED
2. Unassign all orders from chunk:
  - Set `chunkId = null`
  - Set `binNumber = null`
  - Orders remain in batch, available for next chunk
3. Update cart status to AVAILABLE
4. Record cancellation in chunk (no pick completion time)
5. Redirect picker to cart selection or cell selection

**Navigation Guard:**

- Use `beforeunload` event for browser close/refresh
- Use Next.js router events for in-app navigation
- Show confirmation dialog before allowing navigation

**API:** `POST /api/pick`

```typescript
Request: {
  action: 'cancel-chunk',
  chunkId: string,
  reason?: string  // optional: 'picker_cancelled' | 'admin_release'
}

Response: {
  success: boolean,
  ordersReturned: number
}
```

### 6.3 Admin Cart Release (from /settings page)

**Location:** Settings page, Carts section

**UI Changes:**

- Add "Release" button on carts with status IN_USE or PICKED_READY
- Button disabled for AVAILABLE carts
- Different styling for each status:
  - IN_USE: Orange warning button "Release (In Use)"
  - PICKED_READY: Yellow warning button "Release (Ready)"

**Release Dialog (IN_USE cart):**

```
┌─────────────────────────────────────┐
│     Release Cart: Cart A            │
│                                     │
│  ⚠️ This cart is being picked by    │
│     John (started 5 min ago)        │
│                                     │
│  Releasing will:                    │
│  • Cancel the current pick          │
│  • Return 12 orders to queue        │
│  • Make cart available              │
│                                     │
│  Are you sure?                      │
│                                     │
│  [Cancel]         [Release Cart]    │
└─────────────────────────────────────┘
```

**Release Dialog (PICKED_READY cart):**

```
┌─────────────────────────────────────┐
│     Release Cart: Cart A            │
│                                     │
│  ⚠️ This cart has picked items      │
│     waiting for shipping!           │
│                                     │
│  Releasing will:                    │
│  • Mark chunk as cancelled          │
│  • Return 12 orders to queue        │
│  • Make cart available              │
│                                     │
│  Physical items in cart must be     │
│  returned to shelves manually.      │
│                                     │
│  [Cancel]         [Release Cart]    │
└─────────────────────────────────────┘
```

**Admin Release Process:**

1. Find active chunk(s) using this cart
2. For each chunk with status PICKING, PICKED, or SHIPPING:
  - Update status to CANCELLED
  - Unassign all orders (chunkId = null, binNumber = null)
3. Update cart status to AVAILABLE
4. Show success message with count of orders returned

**API:** `POST /api/carts/release`

```typescript
Request: {
  cartId: string,
  reason?: string  // 'admin_release'
}

Response: {
  success: boolean,
  chunksAffected: number,
  ordersReturned: number,
  pickerName?: string  // who was using it
}
```

### 6.4 Settings Page Updates

**Carts Table Columns:**


| Name   | Color | Status            | Actions            |
| ------ | ----- | ----------------- | ------------------ |
| Cart A | 🔵    | AVAILABLE         | [Toggle] [Delete]  |
| Cart B | 🟢    | IN_USE (John, 5m) | [Release] [Toggle] |
| Cart C | 🟡    | PICKED_READY      | [Release] [Toggle] |


**Status Display:**

- AVAILABLE: Green badge
- IN_USE: Orange badge + picker name + duration
- PICKED_READY: Yellow badge + order count

### 6.5 Edge Cases

**What if picker's connection drops mid-pick?**

- Chunk remains in PICKING status
- Cart remains IN_USE
- Admin can release cart from settings
- Orders return to queue

**What if shipper abandons cart mid-ship?**

- Chunk remains in SHIPPING status
- Cart remains PICKED_READY (items are physically in cart)
- Admin must decide: another shipper takes over OR release cart
- If released: items must be manually returned to shelves

**What about partially shipped carts?**

- Some orders already have labels printed
- Release should NOT affect already-shipped orders
- Only unshipped orders return to queue
- Admin sees warning: "3 of 12 orders already shipped"

---

## Cart Configurations

### Standard Cart (12 bins)

```
┌─────┬─────┬─────┬─────┐
│  1  │  2  │  3  │  4  │
├─────┼─────┼─────┼─────┤
│  5  │  6  │  7  │  8  │
├─────┼─────┼─────┼─────┤
│  9  │ 10  │ 11  │ 12  │
└─────┴─────┴─────┴─────┘
```

- Used for Standard batches (orders with 1-12 items)
- 12 orders per chunk
- Each bin = 1 order

### Oversized Cart (6 bins)

```
┌─────────┬─────────┬─────────┐
│    1    │    2    │    3    │
├─────────┼─────────┼─────────┤
│    4    │    5    │    6    │
└─────────┴─────────┴─────────┘
```

- Used for Oversized batches (orders with 13-24 items)
- 6 orders per chunk
- Each bin = 1 order (double-wide for more items)

**Important:** Carts are NEVER mixed. A cart is either all standard bins or all oversized bins.

---

## API Reference

### Cells API (`/api/cells`)


| Method | Action      | Body              | Response                |
| ------ | ----------- | ----------------- | ----------------------- |
| GET    | List cells  | -                 | `{ cells: PickCell[] }` |
| POST   | Create cell | `{ name }`        | `{ cell: PickCell }`    |
| PATCH  | Update cell | `{ id, active? }` | `{ cell: PickCell }`    |
| DELETE | Delete cell | `{ id }`          | `{ success }`           |


### Carts API (`/api/carts`)


| Method | Action      | Body                       | Response                |
| ------ | ----------- | -------------------------- | ----------------------- |
| GET    | List carts  | -                          | `{ carts: PickCart[] }` |
| POST   | Create cart | `{ name, color? }`         | `{ cart: PickCart }`    |
| PATCH  | Update cart | `{ id, active?, status? }` | `{ cart: PickCart }`    |
| DELETE | Delete cart | `{ id }`                   | `{ success }`           |


### Carts Release API (`/api/carts/release`) - NEW


| Method | Action       | Body                  | Response                      |
| ------ | ------------ | --------------------- | ----------------------------- |
| POST   | Release cart | `{ cartId, reason? }` | `{ success, ordersReturned }` |


### Batches API (`/api/batches`)


| Method | Action       | Body                         | Response                      |
| ------ | ------------ | ---------------------------- | ----------------------------- |
| GET    | List batches | query: `cellId?`             | `{ batches: PickBatch[] }`    |
| POST   | Create batch | `{ orderIds, cellId }`       | `{ batches, excluded }`       |
| PATCH  | Update batch | `{ id, status?, priority? }` | `{ batch }`                   |
| DELETE | Delete batch | `{ id }`                     | `{ success, ordersReturned }` |


### Batches Reorder API (`/api/batches/reorder`)


| Method | Action       | Body                                   | Response      |
| ------ | ------------ | -------------------------------------- | ------------- |
| POST   | Reorder/move | `{ batchId, newCellId?, newPriority }` | `{ success }` |


### Pick API (`/api/pick`)


| Method | Action         | Body                                           | Response                                |
| ------ | -------------- | ---------------------------------------------- | --------------------------------------- |
| GET    | Get state      | query: `cellId`                                | `{ cells, carts, availableOrderCount }` |
| POST   | claim-chunk    | `{ action, cellId, cartId, pickerName }`       | `{ chunk }`                             |
| POST   | complete-bin   | `{ action, chunkId, binNumber }`               | `{ success }`                           |
| POST   | complete-chunk | `{ action, chunkId }`                          | `{ success, duration }`                 |
| POST   | out-of-stock   | `{ action, chunkId, sku, affectedBinNumbers }` | `{ success, ordersReturned }`           |
| POST   | cancel-chunk   | `{ action, chunkId, reason? }`                 | `{ success, ordersReturned }`           |


### Ship API (`/api/ship`)


| Method | Action         | Body                                                | Response                |
| ------ | -------------- | --------------------------------------------------- | ----------------------- |
| GET    | Get carts      | query: `action=ready-carts`                         | `{ carts }`             |
| GET    | Get cart       | query: `cartId`                                     | `{ cart }`              |
| POST   | start-shipping | `{ action, cartId, shipperName }`                   | `{ success }`           |
| POST   | verify-item    | `{ action, chunkId, orderNumber, sku }`             | `{ valid, warning? }`   |
| POST   | complete-order | `{ action, chunkId, orderNumber, trackingNumber? }` | `{ success }`           |
| POST   | complete-cart  | `{ action, cartId, chunkId }`                       | `{ success, duration }` |


### Metrics API (`/api/metrics/picking`)


| Method | Action      | Query         | Response |
| ------ | ----------- | ------------- | -------- |
| GET    | Get metrics | `period=today | week     |


---

## File Reference

### Pages

- `app/settings/page.tsx` - Cell and cart management
- `app/products/page.tsx` - SKU bin location management
- `app/batch-queue/page.tsx` - Batch queue with drag-drop
- `app/pick/page.tsx` - Picker interface (iPad)
- `app/cart-scan/page.tsx` - Shipping interface (Desktop)
- `app/analytics/page.tsx` - Performance metrics

### Components

- `components/BoxSizeSpecificTable.tsx` - Order selection for batching
- `components/AddToBatchDialog.tsx` - Batch creation modal
- `components/Sidebar.tsx` - Navigation links

### API Routes

- `app/api/cells/route.ts`
- `app/api/carts/route.ts`
- `app/api/carts/release/route.ts` - NEW
- `app/api/batches/route.ts`
- `app/api/batches/reorder/route.ts`
- `app/api/pick/route.ts`
- `app/api/ship/route.ts`
- `app/api/metrics/picking/route.ts`

### Database

- `prisma/schema.prisma` - Model definitions
- `prisma/migrations/picking_workflow.sql` - Migration SQL

---

## SQL Migration Script

Run this in Supabase SQL Editor to create the picking workflow tables:

```sql
-- Migration: Picking/Packing Workflow Tables
-- Run this in Supabase SQL Editor

-- Create enums
CREATE TYPE "PickBatchStatus" AS ENUM ('DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE "PickChunkStatus" AS ENUM ('AVAILABLE', 'PICKING', 'PICKED', 'SHIPPING', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PickCartStatus" AS ENUM ('AVAILABLE', 'PICKING', 'PICKED_READY', 'SHIPPING');

-- Create pick_cells table
CREATE TABLE "pick_cells" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pick_cells_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pick_cells_active_idx" ON "pick_cells"("active");

-- Create pick_carts table
CREATE TABLE "pick_carts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "status" "PickCartStatus" NOT NULL DEFAULT 'AVAILABLE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pick_carts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pick_carts_status_idx" ON "pick_carts"("status");
CREATE INDEX "pick_carts_active_idx" ON "pick_carts"("active");

-- Create pick_batches table
CREATE TABLE "pick_batches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cell_id" TEXT NOT NULL,
    "status" "PickBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "picked_orders" INTEGER NOT NULL DEFAULT 0,
    "shipped_orders" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pick_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pick_batches_cell_id_idx" ON "pick_batches"("cell_id");
CREATE INDEX "pick_batches_status_idx" ON "pick_batches"("status");
CREATE INDEX "pick_batches_priority_idx" ON "pick_batches"("priority");

-- Add foreign key for pick_batches -> pick_cells
ALTER TABLE "pick_batches" ADD CONSTRAINT "pick_batches_cell_id_fkey" 
    FOREIGN KEY ("cell_id") REFERENCES "pick_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create pick_chunks table
CREATE TABLE "pick_chunks" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "chunk_number" INTEGER NOT NULL,
    "status" "PickChunkStatus" NOT NULL DEFAULT 'AVAILABLE',
    "cart_id" TEXT,
    "picker_name" TEXT,
    "shipper_name" TEXT,
    "orders_in_chunk" INTEGER NOT NULL DEFAULT 0,
    "orders_shipped" INTEGER NOT NULL DEFAULT 0,
    "orders_skipped" INTEGER NOT NULL DEFAULT 0,
    "claimed_at" TIMESTAMP(3),
    "picking_started_at" TIMESTAMP(3),
    "picking_completed_at" TIMESTAMP(3),
    "shipping_started_at" TIMESTAMP(3),
    "shipping_completed_at" TIMESTAMP(3),
    "pick_duration_seconds" INTEGER,
    "ship_duration_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pick_chunks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pick_chunks_batch_id_idx" ON "pick_chunks"("batch_id");
CREATE INDEX "pick_chunks_status_idx" ON "pick_chunks"("status");
CREATE INDEX "pick_chunks_cart_id_idx" ON "pick_chunks"("cart_id");

-- Add foreign keys for pick_chunks
ALTER TABLE "pick_chunks" ADD CONSTRAINT "pick_chunks_batch_id_fkey" 
    FOREIGN KEY ("batch_id") REFERENCES "pick_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pick_chunks" ADD CONSTRAINT "pick_chunks_cart_id_fkey" 
    FOREIGN KEY ("cart_id") REFERENCES "pick_carts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add columns to order_logs for batch/chunk tracking
ALTER TABLE "order_logs" ADD COLUMN "batch_id" TEXT;
ALTER TABLE "order_logs" ADD COLUMN "chunk_id" TEXT;
ALTER TABLE "order_logs" ADD COLUMN "bin_number" INTEGER;

CREATE INDEX "order_logs_batch_id_idx" ON "order_logs"("batch_id");
CREATE INDEX "order_logs_chunk_id_idx" ON "order_logs"("chunk_id");

-- Add foreign keys for order_logs -> pick_batches/pick_chunks
ALTER TABLE "order_logs" ADD CONSTRAINT "order_logs_batch_id_fkey" 
    FOREIGN KEY ("batch_id") REFERENCES "pick_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_logs" ADD CONSTRAINT "order_logs_chunk_id_fkey" 
    FOREIGN KEY ("chunk_id") REFERENCES "pick_chunks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add bin_location to product_skus
ALTER TABLE "product_skus" ADD COLUMN "bin_location" TEXT;
CREATE INDEX "product_skus_bin_location_idx" ON "product_skus"("bin_location");
```

---

## iPad Picker Interface Design

The `/pick` page is designed for **iPad in landscape mode** (1024×768 or higher).

### Design Principles

1. **Full-screen takeover** - No browser chrome, feels like a native app
2. **Large touch targets** - All buttons minimum 48px height, text legible from arm's length
3. **Landscape optimized** - Two-column layout: cart on left, instructions on right
4. **Minimal UI** - Only show what's needed for current task
5. **Hamburger menu** - Options tucked away in ☰ menu (top-left corner)

### Layout (Landscape Mode)

```
┌─────────────────────────────────────────────────────────────────────┐
│ ☰  Cell 1 • Cart A                              Item 3 of 8        │
├───────────────────────────────────┬─────────────────────────────────┤
│                                   │                                 │
│      ┌─────┬─────┬─────┬─────┐    │   GO TO LOCATION               │
│      │  1  │  2  │  3  │  4  │    │                                 │
│      │ ×2  │     │ ×1  │     │    │        A11                      │
│      ├─────┼─────┼─────┼─────┤    │                                 │
│      │  5  │  6  │  7  │  8  │    │   ───────────────────────────   │
│      │     │ ×3  │  ✓  │  ✓  │    │                                 │
│      ├─────┼─────┼─────┼─────┤    │   SKU: DPT16MK                  │
│      │  9  │ 10  │ 11  │ 12  │    │   Red Party Cup 16oz            │
│      │  ✓  │     │     │  ✓  │    │                                 │
│      └─────┴─────┴─────┴─────┘    │   GRAB: 6 items                 │
│                                   │                                 │
│              CART VIEW            │   Bin 1: ×2  Bin 3: ×1         │
│                                   │   Bin 6: ×3                     │
│                                   │                                 │
├───────────────────────────────────┴─────────────────────────────────┤
│                                                                     │
│  [  Out of Stock  ]                    [  Continue →  ]            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Hamburger Menu (☰)

When tapped, slides out from left:

```
┌─────────────────────┐
│  ☰ MENU             │
├─────────────────────┤
│                     │
│  👤 John (Picker)   │
│  🛒 Cart A          │
│  📦 Cell 1          │
│                     │
│  ─────────────────  │
│                     │
│  ❌ Cancel Pick     │
│                     │
│  🔄 Change Cell     │
│                     │
└─────────────────────┘
```

### Touch Target Sizes


| Element             | Minimum Size            | Notes                        |
| ------------------- | ----------------------- | ---------------------------- |
| Cart bins           | 80×80px                 | Large enough to see quantity |
| Continue button     | Full width, 80px height | Main action, easy to tap     |
| Out of Stock button | Full width, 60px height | Secondary action             |
| Menu icon           | 48×48px                 | Top-left corner              |
| Menu items          | Full width, 56px height | Easy to tap in menu          |


### Colors


| State           | Background | Border    | Text      |
| --------------- | ---------- | --------- | --------- |
| Empty bin       | White      | Gray      | Gray      |
| Highlighted bin | Blue-100   | Blue-500  | Blue-700  |
| Completed bin   | Green-100  | Green-500 | Green-700 |
| Skipped bin     | Gray-200   | Gray-400  | Gray-400  |


### Fonts

- Location code: 72px bold (very large, visible from distance)
- SKU code: 32px mono bold
- Item name: 20px regular
- Quantity to grab: 64px bold
- Bin quantities: 24px bold

### Responsive Breakpoints


| Device         | Width      | Layout                                     |
| -------------- | ---------- | ------------------------------------------ |
| iPad Landscape | ≥1024px    | Two-column (cart left, instructions right) |
| iPad Portrait  | 768-1023px | Stacked (cart top, instructions bottom)    |
| Phone          | <768px     | Stacked, smaller elements                  |


---

## Phase 7: Session Management & Stuck Cart Recovery (PLANNING)

### 7.1 Problem Statement

**Real-world scenario:** A picker's iPad dies or loses connection mid-pick. The cart is now stuck in "IN_USE" status with no way for the picker to release it themselves. Admin needs to intervene.

**Current limitations:**

- No user authentication (just name entry)
- No session tracking or heartbeat
- Cart release exists in settings, but requires admin access
- Picker cannot resume their pick from a different device
- No visibility into who is using which cart or for how long

### 7.2 Current Workaround (Already Built)

**Admin can release stuck carts from Settings page:**

1. Go to `/settings`
2. Scroll to "Carts" section
3. Find the cart showing "In Use (Picking)" status
4. Click the "Release" button
5. Confirm the release dialog
6. Cart becomes AVAILABLE, orders return to batch queue

**Important:** This releases the cart immediately. Physical items in the cart must be manually returned to shelves.

### 7.3 Planned Improvements (Production)

#### A. User Authentication

**Goal:** Know exactly who is logged in on each device.

**Implementation:**

- Add login screen before cell selection
- Store user ID in session/JWT
- Track `userId` on `PickChunk` instead of just `pickerName`
- Admin dashboard shows which user has which cart

**Schema changes:**

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  pin       String?  // Optional PIN for quick login on shared iPads
  role      UserRole @default(PICKER)
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
}

enum UserRole {
  ADMIN
  PICKER
  SHIPPER
}
```

#### B. Session Tracking & Heartbeat

**Goal:** Detect when a device goes offline or inactive.

**Implementation:**

- Picker app sends heartbeat every 30 seconds
- Store `lastSeenAt` on active chunks
- If no heartbeat for 5+ minutes, show warning in admin dashboard
- Optional: Auto-release after 15+ minutes of inactivity

**New fields on PickChunk:**

```prisma
lastHeartbeatAt DateTime?  // Updated every 30 seconds during picking
deviceId        String?    // Unique identifier for the device
```

**Heartbeat API:** `POST /api/pick`

```typescript
{
  action: 'heartbeat',
  chunkId: string,
  deviceId: string
}
```

#### C. Admin Dashboard - Cart Status View

**Goal:** Real-time visibility into cart usage.

**New page:** `/admin/carts` or enhanced `/settings`

**Features:**

- List all carts with real-time status
- For IN_USE carts, show:
  - Picker name
  - Time since start
  - Time since last heartbeat (with warning if stale)
  - Progress (X of Y items picked)
- Quick "Release" button with confirmation
- Filter: All / In Use / Stale (>5 min no heartbeat)

**UI Mockup:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  CART STATUS                                    [Refresh] [Release All Stale]│
├──────────┬──────────┬─────────────┬────────────────┬────────────────┤
│ Cart     │ Status   │ Picker      │ Duration       │ Actions        │
├──────────┼──────────┼─────────────┼────────────────┼────────────────┤
│ Cart 1   │ 🟢 Avail │ -           │ -              │ -              │
│ Cart 2   │ 🟠 In Use│ John        │ 4 min          │ [Release]      │
│ Cart 3   │ 🟡 Ready │ (was: Jane) │ Waiting ship   │ [Release]      │
│ Cart 4   │ 🔴 STALE │ Mike        │ 12 min (!)     │ [Release] ⚠️    │
│ Cart 5   │ 🟢 Avail │ -           │ -              │ -              │
│ Cart 6   │ 🟠 In Use│ Sarah       │ 2 min          │ [Release]      │
└──────────┴──────────┴─────────────┴────────────────┴────────────────┘
```

#### D. Resume Pick From Another Device

**Goal:** If iPad dies, picker can grab another iPad and continue their pick.

**Implementation:**

- When picker logs in, check if they have an active chunk
- If yes, offer to resume: "You have an active pick on Cart 3. Resume?"
- If resumed, continue from where they left off
- If they choose "Start Fresh", release the old cart first

**Resume Flow:**

```
Login → Check for active chunk → 
  If found: "Resume Cart 3?" [Resume] [Release & Start Fresh]
  If not: Normal flow (select cell → select cart)
```

#### E. Self-Service Cart Release

**Goal:** Picker can release their own stuck cart from any device.

**Implementation:**

- After login, if user has active chunk, show options
- "I need to release my cart" option
- Requires PIN confirmation (prevents accidental release)
- Only releases carts assigned to that user

#### F. Timeout-Based Auto-Release

**Goal:** Automatically release carts that have been inactive too long.

**Implementation:**

- Background job runs every 5 minutes
- Finds chunks with `lastHeartbeatAt` > 15 minutes ago
- Auto-cancels those chunks, releases carts
- Sends notification to admin (email/Slack)
- Orders return to batch queue

**Configuration:**

```
STALE_WARNING_MINUTES=5      // Show warning in admin after 5 min
AUTO_RELEASE_MINUTES=15      // Auto-release after 15 min
```

### 7.4 Implementation Priority

**Phase 7a - Quick Wins (Now):**

1. ✅ Admin cart release (already built)
2. Improve visibility: Show picker name and start time on cart status
3. Add activity tracking: `pickingStartedAt` timestamp visibility

**Phase 7b - Session Tracking (Next):**

1. Add heartbeat mechanism to picker app
2. Track `lastHeartbeatAt` on chunks
3. Show stale/warning indicator in admin UI

**Phase 7c - User Auth (Later):**

1. Add User model and authentication
2. Replace name input with login
3. Enable resume-from-another-device
4. Enable self-service release

**Phase 7d - Auto-Release (Production):**

1. Background job for stale cart detection
2. Auto-release with notifications
3. Admin configuration for timeout values

### 7.5 Immediate Action Items

For the current issue (Cart 6 stuck):

1. **Check settings page** - "Release" button should appear for carts with status "PICKING" or "PICKED_READY"
2. **If button missing** - verify `/api/carts/release` route exists and works
3. **If button exists but fails** - check browser console for errors

**Manual database fix (if needed):**

```sql
-- Check cart status
SELECT id, name, status FROM pick_carts WHERE name = 'Cart 6';

-- Find active chunks for this cart
SELECT pc.id, pc.status, pc.picker_name, pc.picking_started_at 
FROM pick_chunks pc 
JOIN pick_carts cart ON pc.cart_id = cart.id 
WHERE cart.name = 'Cart 6' AND pc.status IN ('PICKING', 'PICKED', 'SHIPPING');

-- Manual release (if needed):
-- 1. Cancel the chunk
UPDATE pick_chunks SET status = 'CANCELLED' WHERE cart_id = 'CART_ID_HERE' AND status IN ('PICKING', 'PICKED', 'SHIPPING');

-- 2. Unassign orders from chunk
UPDATE order_logs SET chunk_id = NULL, bin_number = NULL WHERE chunk_id = 'CHUNK_ID_HERE';

-- 3. Release the cart
UPDATE pick_carts SET status = 'AVAILABLE' WHERE id = 'CART_ID_HERE';
```

---

## Migration Hotfixes

If you applied the original migration before these fixes were added, run these in Supabase SQL Editor:

### Hotfix 1: Add CANCELLED status to PickChunkStatus

```sql
-- Required for chunk cancellation feature
ALTER TYPE "PickChunkStatus" ADD VALUE 'CANCELLED';
```

