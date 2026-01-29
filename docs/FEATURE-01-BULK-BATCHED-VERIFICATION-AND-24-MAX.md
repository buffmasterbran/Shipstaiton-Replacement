# Feature 01: Bulk Batched Orders — Verification Process & Max 24 Orders

**Status:** Draft — awaiting confirmation before implementation  
**Goal:** Mitigate wrong-order packing by (1) capping packer batches at 24 orders and (2) requiring barcode verification before printing labels.

---

## 1. Summary

- **Max 24 orders per packer batch:** No single “batch” that a packer works on may contain more than 24 orders. Large bulk groups (e.g. 200 orders) are split into chunks of at most 24.
- **Verification before labels:** Before labels can be printed, the packer must scan one barcode per distinct item (to confirm color/size) and explicitly confirm quantity. Only after that can they print labels.

These apply to the **Bulk** flow: Admin sends work to a **queue**; packers pick work from the queue and go through **Bulk Verification** (this feature).

---

## 2. Max 24 Orders per Packer Batch

### 2.1 Rule

- A **packer batch** (the unit a packer sees and prints labels for) must never exceed **24 orders**.
- If a bulk group has more than 24 orders (e.g. 200), the system **chunks** it into multiple packer batches:
  - Each chunk: **≤ 24 orders**.
  - Example: 200 orders → 8 chunks of 24 + 1 chunk of 8 (or similar; last chunk can be smaller).

### 2.2 Where it applies

- **Admin Bulk (send to queue):** When admin “bulk processes” and sends to the queue, the system should create **queue items** that are already chunked to max 24 orders each. So the queue stores “chunk 1 of bulk group X (24 orders)”, “chunk 2 of bulk group X (24 orders)”, etc.
- **Bulk Verification (packer):** Each item in the verification list is one packer batch (≤ 24 orders). Packer never sees or prints more than 24 orders at once.

### 2.3 Rationale (from your notes)

- “We can’t do more than 24 bulk even if we have hundreds/1000’s.”
- “Effects of bulking 100’s means we need to send return labels to 100’s vs 24.”
- “Basically we are breaking a batch of 200 into ‘chunks’ of 24 for the actual packer. Packer will NEVER pack more than 24 orders.”

---

## 3. Verification Process (before printing labels)

### 3.1 Where it happens

- **Bulk Verification** screen (all users): list of bulk queue items that Admin has sent and that have **not** been processed yet.

### 3.2 Flow

1. **Start bulk**
   - User clicks something like **“Start bulk”** for one queue item (one packer batch, ≤ 24 orders).
   - A **dialog** opens showing the **picklist** for that batch (items, quantities, colors, sizes).

2. **Barcode scan (one per distinct item)**
   - User must **scan the barcode** for **one of each distinct item** in the batch (e.g. one SKU per color/size combo).
   - Purpose: confirm **color and size** match what’s on the picklist.
   - System tracks which items have been scanned; all must be scanned before moving on.

3. **Quantity confirmation**
   - User must **actively confirm** that the **quantity** for each item is correct (e.g. “I have 10 of SKU X”).
   - This can be a checkbox or “Confirm quantity” per line, or one “I confirm all quantities” — to be decided in UI.

4. **Print labels**
   - Only when:
     - Every distinct item has been scanned (barcode verification), and  
     - Quantities have been confirmed  
   … does **“Print labels”** become available (or enabled).
   - Clicking it prints the shipping labels for that packer batch (≤ 24 orders).

### 3.3 Summary of checks

| Step              | What user does                          | System enforces                          |
|-------------------|-----------------------------------------|------------------------------------------|
| Open batch        | Clicks “Start bulk”                     | Shows picklist in dialog                 |
| Barcode verify    | Scans one barcode per distinct item     | All items scanned before next step      |
| Quantity confirm  | Confirms quantities are correct         | Explicit confirmation required           |
| Print labels      | Clicks “Print labels”                   | Only enabled after scan + quantity done  |

---

## 4. Data / UX Notes (for implementation)

- **Queue model:** We’ll need a way to store “bulk queue items” (each = one packer batch of ≤ 24 orders). Each record should reference the source bulk group and the chunk index (e.g. chunk 1 of 9).
- **Verification state:** For each queue item we may need status: e.g. `pending` → `verification_in_progress` (scans/confirmation done) → `labels_printed` (and optionally `shipped` later).
- **Barcode:** Implementation can start with “manual confirm” per item (e.g. “Mark SKU X as verified”) if hardware barcode scanning isn’t wired yet; the important part is “one of each item verified + quantity confirmed” before print.

---

## 5. Acceptance Criteria (concise)

- [ ] No packer batch exceeds 24 orders (chunking on send-to-queue and in verification list).
- [ ] Bulk Verification lists only queue items that are not yet processed.
- [ ] “Start bulk” opens a dialog that shows the picklist for that batch.
- [ ] User must complete barcode verification (one scan per distinct item) before “Print labels” is available.
- [ ] User must confirm quantities before “Print labels” is available.
- [ ] “Print labels” prints labels only for that packer batch (≤ 24 orders).

---

## 6. Out of scope for this feature

- **Admin “send to queue”** behavior (e.g. not sending to ShipEngine, only to queue) — that’s the **Bulk Orders (admin)** feature; we’ll spec that next and ensure chunking is defined there.
- **5-item max** for bulk pick, **admin-set sizes/weights**, **rate shoppers** — those stay in the Admin Bulk feature spec.
- Singles, Expedited, All Orders, other tabs — unchanged by this feature.

---

**Next step:** Confirm this spec (or note edits). Once confirmed, we implement Feature 01, then move to the next feature (e.g. Tabs on the Left / All Orders, or Bulk Orders admin with queue + chunking).
