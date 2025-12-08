// API Base URL - use relative path to work both locally and on Railway
const API_BASE = '/api';

// State Management
let appState = {
    summary: {},
    orders: [],
    inventory: [],
    fulfillments: [],
    currentPage: 'singles',
    currentSizeFilter: 'all',
    currentPackFilter: 'all',
    singleItemOrders: [],
    packConfig: null,
    // Track which orders belong to which category (for mutual exclusivity)
    singlesOrderIds: new Set(),
    bulkOrderIds: new Set(),
    highVolumeOrderIds: new Set()
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initSizeFilters();
    initColorFilters();
    initBulkOrderSlider();
    initProcessButton();
    loadPackConfig();
    loadDashboardData();
    initSearch();
    initModal();
    initBatchModal();
});

// Navigation
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.getAttribute('data-page');
            
            // Update active state
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // Switch pages
            switchPage(page);
            
            appState.currentPage = page;
        });
    });
}

// Switch between pages
function switchPage(pageName) {
    // Hide all pages
    document.querySelectorAll('.page-content').forEach(page => {
        page.style.display = 'none';
    });
    
    // Show selected page
    const selectedPage = document.getElementById(`page-${pageName}`);
    if (selectedPage) {
        selectedPage.style.display = 'block';
    }
    
    // Update page title
    const titles = {
        'all-orders': 'All Orders',
        'singles': 'Singles Orders',
        'bulk': 'Bulk Orders',
        'box-size': 'Box Size Specific',
        'high-volume': 'High Volume Orders',
        'unique': 'Unique Orders'
    };
    
    document.getElementById('pageTitle').textContent = titles[pageName] || 'Dashboard';
    
    // Load data for the specific page
    loadPageData(pageName);
}

// Load data for specific page
function loadPageData(pageName) {
    console.log(`Loading data for: ${pageName}`);
    
    switch(pageName) {
        case 'all-orders':
            loadAllOrders();
            break;
        case 'singles':
            loadSinglesOrders();
            break;
        case 'bulk':
            loadBulkOrders();
            break;
        case 'box-size':
            loadBoxSizeOrders();
            break;
        case 'high-volume':
            loadHighVolumeOrders();
            break;
        case 'unique':
            loadUniqueOrders();
            break;
    }
}

// Initialize size filter buttons
function initSizeFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active state
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Get selected size
            const size = button.getAttribute('data-size');
            appState.currentSizeFilter = size;
            
            // Filter and display orders (combine with color filter)
            const colorFilter = appState.currentColorFilter || 'all';
            filterSinglesOrders(size, colorFilter);
        });
    });
}

// Initialize Color Filters
function initColorFilters() {
    const colorFilterButtons = document.querySelectorAll('.color-filter-btn');
    
    colorFilterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active state
            colorFilterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Get selected color
            const color = button.getAttribute('data-color');
            appState.currentColorFilter = color;
            
            // Filter and display orders (combine with size filter)
            const sizeFilter = appState.currentSizeFilter || 'all';
            filterSinglesOrders(sizeFilter, color);
        });
    });
}

// Initialize Bulk Order Slider
function initBulkOrderSlider() {
    const slider = document.getElementById('bulkOrderSlider');
    const valueDisplay = document.getElementById('bulkOrderValue');
    
    if (slider && valueDisplay) {
        // Update display value
        function updateSliderValue() {
            const value = parseInt(slider.value);
            if (value === 20) {
                valueDisplay.textContent = '20+';
            } else {
                valueDisplay.textContent = `${value}+`;
            }
        }
        
        // Initialize display
        updateSliderValue();
        
        // Add event listener for slider changes
        slider.addEventListener('input', () => {
            updateSliderValue();
            
            // Filter bulk orders based on slider value
            const minOrders = parseInt(slider.value);
            filterBulkOrdersByCount(minOrders);
        });
    }
}

// Filter Bulk Orders by Count
function filterBulkOrdersByCount(minOrderCount) {
    // Get all bulk order groups from appState or re-process them
    const allBulkGroups = getBulkOrderGroups();
    
    // Filter groups based on minimum order count
    const filteredGroups = allBulkGroups.filter(group => group.totalOrders >= minOrderCount);
    
    // Display filtered groups
    displayBulkOrders(filteredGroups);
    
    console.log(`Filtered bulk orders: showing ${filteredGroups.length} groups with ${minOrderCount}+ orders`);
}

// Get Bulk Order Groups (helper function)
function getBulkOrderGroups() {
    // Create a signature for each order based on its items
    const orderSignatures = new Map();
    
    // Group fulfillments by sales order first
    const orderMap = new Map();
    appState.fulfillments.forEach(f => {
        const orderId = f.salesOrderId || f.transactionId;
        if (!orderMap.has(orderId)) {
            orderMap.set(orderId, []);
        }
        orderMap.get(orderId).push(f);
    });
    
    // For each order, create a signature and group identical ones (excluding singles)
    orderMap.forEach((items, orderId) => {
        // EXCLUDE orders that are already in Singles
        if (appState.singlesOrderIds.has(orderId)) {
            return;
        }
        
        // Sort items by SKU and create a signature
        const itemSignature = items
            .map(item => `${item.itemSku}:${item.quantity}`)
            .sort()
            .join('|');
        
        if (!orderSignatures.has(itemSignature)) {
            orderSignatures.set(itemSignature, {
                signature: itemSignature,
                items: items.map(item => ({
                    sku: item.itemSku,
                    name: item.itemName,
                    quantity: item.quantity,
                    size: item.itemSize,
                    color: item.itemColor
                })),
                orders: [],
                totalOrders: 0
            });
        }
        
        const group = orderSignatures.get(itemSignature);
        group.orders.push({
            orderId: orderId,
            customer: items[0].customerName,
            shipDate: items[0].shipDate,
            status: items[0].status
        });
        group.totalOrders++;
    });
    
    // Filter to only show groups with 2+ identical orders
    const bulkGroups = Array.from(orderSignatures.values())
        .filter(group => group.totalOrders >= 2)
        .sort((a, b) => b.totalOrders - a.totalOrders); // Sort by count descending
    
    return bulkGroups;
}

// Load pack configuration
async function loadPackConfig() {
    try {
        const response = await fetch('/pack-config.json');
        if (response.ok) {
            appState.packConfig = await response.json();
            console.log('Pack configuration loaded:', appState.packConfig);
        } else {
            console.error('Failed to load pack configuration');
        }
    } catch (error) {
        console.error('Error loading pack configuration:', error);
    }
}

// Initialize Batch Singles button
function initProcessButton() {
    const batchBtn = document.getElementById('batch-singles-btn');
    
    if (batchBtn) {
        batchBtn.addEventListener('click', () => {
            createBatchFromSinglesOrders();
        });
    }
}

// Process Singles Orders
function processSinglesOrders() {
    // Get currently displayed orders (respects the active filter)
    const currentFilter = appState.currentSizeFilter;
    let ordersToProcess = [...appState.singleItemOrders];
    
    // Apply the same filter logic
    if (currentFilter !== 'all') {
        ordersToProcess = ordersToProcess.filter(order => {
            const sku = order.itemSku || '';
            const itemSize = order.itemSize || '';
            
            if (currentFilter === '10oz') {
                return sku.startsWith('DPT10') || sku.startsWith('PT10') || itemSize.includes('10oz');
            } else if (currentFilter === '16oz') {
                return sku.startsWith('DPT16') || sku.startsWith('PT16') || itemSize.includes('16oz');
            } else if (currentFilter === '26oz') {
                return sku.startsWith('DPT26') || sku.startsWith('PT26') || itemSize.includes('26oz');
            } else if (currentFilter === 'stickers') {
                return sku.startsWith('PL-STCK');
            }
            return false;
        });
    }
    
    console.log(`Processing ${ordersToProcess.length} single orders with filter: ${currentFilter}`);
    
    // Show confirmation dialog
    const confirmMessage = currentFilter === 'all' 
        ? `Process all ${ordersToProcess.length} single item orders?`
        : `Process ${ordersToProcess.length} ${currentFilter} orders?`;
    
    if (confirm(confirmMessage)) {
        // TODO: Add actual processing logic here
        // For now, just show a success message
        showSuccessMessage(`Successfully processed ${ordersToProcess.length} orders!`);
    }
}

// Show success message
function showSuccessMessage(message) {
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: #00A86B;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,168,107,0.3);
        z-index: 1000;
        font-weight: 600;
        animation: slideIn 0.3s ease-out;
    `;
    successDiv.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        successDiv.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => successDiv.remove(), 300);
    }, 3000);
}

// Pre-categorize singles orders (for mutual exclusivity tracking)
function categorizeSinglesOrders() {
    // Filter fulfillments to get single item orders
    const singleItemFulfillments = appState.fulfillments.filter(f => f.quantity === 1);
    
    // Group by order ID to show each order only once
    const orderMap = new Map();
    
    singleItemFulfillments.forEach(fulfillment => {
        const orderId = fulfillment.salesOrderId || fulfillment.transactionId;
        
        if (!orderMap.has(orderId)) {
            // First item for this order - store it
            orderMap.set(orderId, {
                ...fulfillment,
                itemCount: 1,
                allItems: [fulfillment.itemSku]
            });
        } else {
            // Order already exists - increment count and add item
            const existing = orderMap.get(orderId);
            existing.itemCount++;
            existing.allItems.push(fulfillment.itemSku);
        }
    });
    
    // Convert back to array - only orders with exactly 1 unique item (singles)
    appState.singleItemOrders = Array.from(orderMap.values()).filter(order => order.itemCount === 1);
    
    // Track singles order IDs for mutual exclusivity
    appState.singlesOrderIds.clear();
    appState.singleItemOrders.forEach(order => {
        const orderId = order.salesOrderId || order.transactionId;
        appState.singlesOrderIds.add(orderId);
    });
    
    console.log(`Categorized ${appState.singlesOrderIds.size} single orders`);
}

// Load singles orders (orders with only 1 item per fulfillment)
function loadSinglesOrders() {
    // Ensure singles are categorized (may already be done during initial load)
    if (appState.singleItemOrders.length === 0 || appState.singlesOrderIds.size === 0) {
        categorizeSinglesOrders();
    }
    
    // Display with current filter
    filterSinglesOrders(appState.currentSizeFilter);
}

// Load bulk orders (group identical orders)
function loadBulkOrders() {
    // Get bulk order groups using the helper function
    const bulkGroups = getBulkOrderGroups();
    
    // Track bulk order IDs for mutual exclusivity
    appState.bulkOrderIds.clear();
    bulkGroups.forEach(group => {
        group.orders.forEach(order => {
            appState.bulkOrderIds.add(order.orderId);
        });
    });
    
    console.log(`Categorized ${appState.bulkOrderIds.size} bulk orders (excluding ${appState.singlesOrderIds.size} singles)`);
    
    // Display with default minimum of 2 orders
    displayBulkOrders(bulkGroups);
}

// Display bulk orders as tiles
function displayBulkOrders(bulkGroups) {
    const container = document.getElementById('bulkOrdersGrid');
    container.innerHTML = '';
    
    if (bulkGroups.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-secondary);">No bulk orders found. Bulk orders are groups of 2+ identical orders.</p>';
        return;
    }
    
    bulkGroups.forEach((group, index) => {
        const tile = document.createElement('div');
        tile.className = 'bulk-order-tile';
        
        // Create items list
        const itemsHtml = group.items.map(item => `
            <div class="bulk-item">
                <div class="bulk-item-icon"></div>
                <div>
                    <span class="bulk-item-sku">${item.sku}</span>
                    <span class="bulk-item-quantity"> × ${item.quantity}</span>
                </div>
            </div>
        `).join('');
        
        tile.innerHTML = `
            <div class="bulk-tile-header">
                <div class="bulk-tile-title">Bulk Order ${index + 1}</div>
                <div class="bulk-tile-count">${group.totalOrders} orders</div>
            </div>
            <div class="bulk-tile-items">
                ${itemsHtml}
            </div>
            <div class="bulk-tile-footer">
                <div class="bulk-tile-actions">
                    <button class="btn-sm btn-secondary bulk-view-btn" data-group-index="${index}">
                        <i class="fas fa-eye"></i>
                        View Orders
                    </button>
                    <button class="btn-sm btn-primary bulk-batch-btn" data-group-index="${index}">
                        <i class="fas fa-layer-group"></i>
                        Batch Orders
                    </button>
                </div>
            </div>
        `;
        
        // Add event handlers for the buttons
        const viewBtn = tile.querySelector('.bulk-view-btn');
        const batchBtn = tile.querySelector('.bulk-batch-btn');
        
        // View Orders button
        viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showBulkOrderDetails(group, index + 1);
        });
        
        // Batch Orders button
        batchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            createBatchFromBulkGroup(group, index + 1);
        });
        
        container.appendChild(tile);
    });
    
    console.log(`Displaying ${bulkGroups.length} bulk order groups`);
}

// Show details of a bulk order group
function showBulkOrderDetails(group, groupNumber) {
    const ordersHtml = group.orders.map(order => `
        <tr>
            <td><strong>${order.orderId}</strong></td>
            <td>${order.customer}</td>
            <td>${order.shipDate || '-'}</td>
            <td><span class="status-badge">${order.status}</span></td>
        </tr>
    `).join('');
    
    const itemsListHtml = group.items.map(item => 
        `<li><strong>${item.sku}</strong> × ${item.quantity}</li>`
    ).join('');
    
    const message = `
        <div style="max-width: 800px;">
            <h3>Bulk Order ${groupNumber}</h3>
            <p><strong>${group.totalOrders} Identical Orders</strong></p>
            
            <h4>Items in each order:</h4>
            <ul style="margin: 10px 0; padding-left: 20px;">
                ${itemsListHtml}
            </ul>
            
            <h4>Orders:</h4>
            <table class="data-table" style="margin-top: 10px;">
                <thead>
                    <tr>
                        <th>Order ID</th>
                        <th>Customer</th>
                        <th>Ship Date</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${ordersHtml}
                </tbody>
            </table>
        </div>
    `;
    
    // Create modal or show in console for now
    // You can enhance this with a proper modal later
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 20px;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 12px;
        max-width: 900px;
        max-height: 80vh;
        overflow-y: auto;
        position: relative;
    `;
    
    modalContent.innerHTML = `
        ${message}
        <button onclick="this.parentElement.parentElement.remove()" 
                style="margin-top: 20px; padding: 12px 24px; background: var(--forever-green); 
                       color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
            Close
        </button>
    `;
    
    modal.appendChild(modalContent);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    
    document.body.appendChild(modal);
}

// Filter singles orders by size and color
function filterSinglesOrders(size, color = 'all') {
    let filteredOrders = [...appState.singleItemOrders];
    
    // Apply size filter based on SKU pattern
    if (size !== 'all') {
        filteredOrders = filteredOrders.filter(order => {
            const sku = order.itemSku || '';
            const itemSize = order.itemSize || '';
            
            // Match by SKU prefix (DPT10, DPT16, DPT26, PT10, PT16, PT26)
            // or by item size field
            if (size === '10oz') {
                return sku.startsWith('DPT10') || sku.startsWith('PT10') || itemSize.includes('10oz');
            } else if (size === '16oz') {
                return sku.startsWith('DPT16') || sku.startsWith('PT16') || itemSize.includes('16oz');
            } else if (size === '26oz') {
                return sku.startsWith('DPT26') || sku.startsWith('PT26') || itemSize.includes('26oz');
            } else if (size === 'stickers') {
                return sku.startsWith('PL-STCK');
            }
            return false;
        });
    }
    
    // Apply color filter
    if (color !== 'all') {
        filteredOrders = filteredOrders.filter(order => {
            const itemColor = order.itemColor || '';
            return itemColor === color;
        });
    }
    
    // Sort by SKU alphabetically
    filteredOrders.sort((a, b) => {
        const skuA = a.itemSku || '';
        const skuB = b.itemSku || '';
        return skuA.localeCompare(skuB);
    });
    
    // Display the filtered orders
    displaySinglesOrders(filteredOrders);
}


// Helper function to extract product size from SKU
function getProductSizeFromSku(sku) {
    if (sku.startsWith('DPT10') || sku.startsWith('PT10')) {
        return 'DPT10';
    } else if (sku.startsWith('DPT16') || sku.startsWith('PT16')) {
        return 'DPT16';
    } else if (sku.startsWith('DPT26') || sku.startsWith('PT26')) {
        return 'DPT26';
    }
    return null;
}

// Check if an order matches both item size filter AND pack size filter
function canOrderFitInCombinedFilter(order, itemSizeFilter, packSizeKey) {
    if (!appState.packConfig) return false;
    
    const items = order.items || [{ sku: order.itemSku, quantity: order.quantity }];
    
    // First check if order matches the item size filter
    if (itemSizeFilter !== 'all') {
        const hasMatchingItem = items.some(item => {
            const sku = item.sku || order.itemSku || '';
            const itemSize = order.itemSize || '';
            
            if (itemSizeFilter === '10oz') {
                return sku.startsWith('DPT10') || sku.startsWith('PT10') || itemSize.includes('10oz');
            } else if (itemSizeFilter === '16oz') {
                return sku.startsWith('DPT16') || sku.startsWith('PT16') || itemSize.includes('16oz');
            } else if (itemSizeFilter === '26oz') {
                return sku.startsWith('DPT26') || sku.startsWith('PT26') || itemSize.includes('26oz');
            } else if (itemSizeFilter === 'stickers') {
                return sku.startsWith('PL-STCK');
            }
            return false;
        });
        
        if (!hasMatchingItem) {
            console.log(`Order ${order.id || order.salesOrderId}: No items match item size filter ${itemSizeFilter}`);
            return false;
        }
    }
    
    // Then check if order can fit in the specified pack size
    return canOrderFitInPackSize(order, packSizeKey);
}

// Check if an order can fit exactly in a specific pack size
function canOrderFitInPackSize(order, packSizeKey) {
    if (!appState.packConfig) return false;
    
    const packConfig = appState.packConfig.packSizes[packSizeKey];
    if (!packConfig) return false;
    
    const items = order.items || [{ sku: order.itemSku, quantity: order.quantity }];
    const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
    
    // STRICT RULE: Single pack - only orders with exactly 1 item
    if (packSizeKey === 'single') {
        return totalQuantity === 1;
    }
    
    // STRICT RULE: For multi-pack sizes, total quantity must exactly match the pack size
    if (totalQuantity !== packConfig.maxItems) {
        console.log(`Order ${order.id || order.salesOrderId}: Total quantity ${totalQuantity} does not match pack size ${packConfig.maxItems} for ${packSizeKey}`);
        return false;
    }
    
    // For other pack sizes, check if the order items can fit in any of the pack combinations
    const productSizes = [];
    items.forEach(item => {
        const size = getProductSizeFromSku(item.sku);
        if (size) {
            // Add the size for each quantity
            for (let i = 0; i < (item.quantity || 1); i++) {
                productSizes.push(size);
            }
        } else {
            // If we can't determine the size from SKU, we can't pack it in any standard pack
            // This prevents unknown SKUs from being incorrectly categorized
            console.log(`Unknown SKU size for: ${item.sku}, cannot pack in standard pack sizes`);
        }
    });
    
    // If we have unknown SKUs or no valid sizes, the order cannot fit in standard packs
    if (productSizes.length === 0) {
        console.log(`Order ${order.id || order.salesOrderId}: No valid product sizes found`);
        return false;
    }
    
    // STRICT RULE: All items must have valid sizes (no mixed unknown/known items)
    if (productSizes.length !== totalQuantity) {
        console.log(`Order ${order.id || order.salesOrderId}: Product sizes length ${productSizes.length} doesn't match total quantity ${totalQuantity}`);
        return false;
    }
    
    // Check if any combination in the pack size can accommodate all the items
    const canFit = packConfig.combinations.some(combination => {
        // Create a copy of the combination to work with
        const availableSlots = [...combination];
        
        // Try to place each item in the pack
        for (const itemSize of productSizes) {
            const slotIndex = availableSlots.findIndex(slot => slot === itemSize);
            if (slotIndex !== -1) {
                // Remove the used slot
                availableSlots.splice(slotIndex, 1);
            } else {
                // Item can't be placed in this combination
                return false;
            }
        }
        
        // All items were successfully placed
        return true;
    });
    
    console.log(`Order ${order.id || order.salesOrderId}: Can fit in ${packSizeKey}? ${canFit} (items: ${productSizes.join(', ')})`);
    return canFit;
}

// Display singles orders in the table
function displaySinglesOrders(orders) {
    const tbody = document.getElementById('singlesOrdersTableBody');
    tbody.innerHTML = '';
    
    if (orders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #999;">
                    No single item orders found for the selected filter
                </td>
            </tr>
        `;
        return;
    }
    
    orders.forEach(order => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${order.salesOrderId || order.transactionId}</strong></td>
            <td>${order.customerName}</td>
            <td><strong>${order.itemSku}</strong></td>
            <td>${order.itemSize || '-'}</td>
            <td>${order.quantity}</td>
            <td>${order.shipDate || '-'}</td>
            <td><span class="status-badge">${order.status}</span></td>
        `;
        tbody.appendChild(row);
    });
    
    console.log(`Displaying ${orders.length} single item orders`);
}

// Load high volume orders (group by SKU)
function loadHighVolumeOrders() {
    // Group fulfillments by SKU (excluding Singles and Bulk orders)
    const skuMap = new Map();
    
    appState.fulfillments.forEach(fulfillment => {
        const orderId = fulfillment.salesOrderId || fulfillment.transactionId;
        
        // EXCLUDE orders that are already in Singles or Bulk
        if (appState.singlesOrderIds.has(orderId) || appState.bulkOrderIds.has(orderId)) {
            return;
        }
        
        const sku = fulfillment.itemSku;
        
        if (!skuMap.has(sku)) {
            skuMap.set(sku, {
                sku: sku,
                itemName: fulfillment.itemName,
                itemSize: fulfillment.itemSize,
                itemColor: fulfillment.itemColor,
                orderCount: 0,
                totalQuantity: 0,
                orders: [],
                orderIds: new Set()
            });
        }
        
        const skuData = skuMap.get(sku);
        
        // Only count unique orders per SKU
        if (!skuData.orderIds.has(orderId)) {
            skuData.orderCount++;
            skuData.orderIds.add(orderId);
        }
        
        skuData.totalQuantity += fulfillment.quantity;
        skuData.orders.push(fulfillment);
    });
    
    // Convert to array and filter for items with multiple orders (2+)
    const highVolumeItems = Array.from(skuMap.values())
        .filter(item => item.orderCount >= 2)
        .sort((a, b) => b.orderCount - a.orderCount); // Sort by order count descending
    
    // Track high volume order IDs for mutual exclusivity
    appState.highVolumeOrderIds.clear();
    highVolumeItems.forEach(item => {
        item.orderIds.forEach(orderId => {
            appState.highVolumeOrderIds.add(orderId);
        });
    });
    
    console.log(`Categorized ${appState.highVolumeOrderIds.size} high volume orders (excluding ${appState.singlesOrderIds.size} singles + ${appState.bulkOrderIds.size} bulk)`);
    
    const tbody = document.getElementById('highVolumeTableBody');
    tbody.innerHTML = '';
    
    if (highVolumeItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">No high volume items found</td></tr>';
        return;
    }
    
    highVolumeItems.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${item.sku}</strong></td>
            <td>${item.itemName}</td>
            <td>${item.itemSize || '-'}</td>
            <td><span class="status-badge">${item.orderCount} orders</span></td>
            <td><strong>${item.totalQuantity}</strong></td>
            <td><button class="view-orders-btn" data-sku="${item.sku}" data-count="${item.orderCount}">View Orders</button></td>
        `;
        tbody.appendChild(row);
    });
    
    // Add click handlers for view buttons
    document.querySelectorAll('.view-orders-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sku = btn.getAttribute('data-sku');
            const count = btn.getAttribute('data-count');
            showOrdersForSku(sku, count);
        });
    });
}

// Show orders for a specific SKU
function showOrdersForSku(sku, count) {
    // Filter to get only orders with this SKU that aren't in Singles or Bulk
    const skuData = appState.fulfillments.filter(f => {
        const orderId = f.salesOrderId || f.transactionId;
        return f.itemSku === sku && 
               !appState.singlesOrderIds.has(orderId) && 
               !appState.bulkOrderIds.has(orderId);
    });
    
    // Update title
    document.getElementById('sku-orders-title').textContent = `${count} Orders for ${sku}`;
    
    // Show the card
    document.getElementById('sku-orders-card').style.display = 'block';
    
    // Populate table
    const tbody = document.getElementById('skuOrdersTableBody');
    tbody.innerHTML = '';
    
    skuData.forEach(order => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${order.salesOrderId || order.transactionId}</strong></td>
            <td>${order.customerName}</td>
            <td>${order.quantity}</td>
            <td>${order.shipDate || '-'}</td>
            <td><span class="status-badge">${order.status}</span></td>
        `;
        tbody.appendChild(row);
    });
    
    // Scroll to the orders table
    document.getElementById('sku-orders-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Load unique orders
function loadUniqueOrders() {
    // Unique orders are those that don't fit Singles, Bulk, or High Volume
    // Simply exclude any order that's already been categorized
    
    const uniqueOrders = appState.orders.filter(order => {
        const orderId = order.id;
        
        // EXCLUDE orders that are already in Singles, Bulk, or High Volume
        if (appState.singlesOrderIds.has(orderId)) return false;
        if (appState.bulkOrderIds.has(orderId)) return false;
        if (appState.highVolumeOrderIds.has(orderId)) return false;
        
        // This is a unique order (everything else)
        return true;
    });
    
    console.log(`Found ${uniqueOrders.length} unique orders (excluding ${appState.singlesOrderIds.size} singles + ${appState.bulkOrderIds.size} bulk + ${appState.highVolumeOrderIds.size} high volume)`);
    
    const tbody = document.getElementById('uniqueOrdersTableBody');
    tbody.innerHTML = '';
    
    if (uniqueOrders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #999;">No unique orders found</td></tr>';
        return;
    }
    
    uniqueOrders.forEach(order => {
        const row = document.createElement('tr');
        const itemsList = order.items?.map(item => `${item.sku} (${item.quantity})`).join(', ') || 'Mixed items';
        row.innerHTML = `
            <td><strong>${order.id}</strong></td>
            <td>${order.customerName}</td>
            <td>${order.totalQuantity}</td>
            <td style="font-size: 0.85em;">${itemsList}</td>
            <td><span class="status-badge">${order.status}</span></td>
        `;
        tbody.appendChild(row);
    });
}

// Load box size specific orders
function loadBoxSizeOrders() {
    console.log('Loading box size specific orders...');
    
    // Get all orders that could be organized by box/pack size
    const allOrders = [];
    
    // Collect singles orders
    appState.singleItemOrders.forEach(order => {
        allOrders.push({
            ...order,
            orderType: 'singles',
            packSize: getOptimalPackSize(order),
            compatiblePacks: getCompatiblePacks(order)
        });
    });
    
    // Collect bulk orders
    appState.orders.forEach(order => {
        if (order.items && order.items.length > 1 && !appState.singlesOrderIds.has(order.id) && !appState.highVolumeOrderIds.has(order.id)) {
            allOrders.push({
                ...order,
                orderType: 'bulk',
                packSize: getOptimalPackSize(order),
                compatiblePacks: getCompatiblePacks(order)
            });
        }
    });
    
    // Sort by pack size and then by order date
    allOrders.sort((a, b) => {
        const packSizeA = a.packSize || 'unknown';
        const packSizeB = b.packSize || 'unknown';
        
        if (packSizeA !== packSizeB) {
            return packSizeA.localeCompare(packSizeB);
        }
        
        return new Date(b.orderDate || b.createdDate) - new Date(a.orderDate || a.createdDate);
    });
    
    // Store processed orders in appState so they can be found by findOrderById
    appState.processedBoxSizeOrders = allOrders;
    
    renderBoxSizeOrdersTable(allOrders);
    initBoxSizeFilters(allOrders);
}

// Get optimal pack size for an order
function getOptimalPackSize(order) {
    if (!appState.packConfig) return 'unknown';
    
    const items = order.items || [{ sku: order.itemSku, quantity: order.quantity }];
    const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
    
    // If total quantity is 1, it's always a single
    if (totalQuantity === 1) {
        return appState.packConfig.packSizes.single.name;
    }
    
    // Check each pack size to see which one fits exactly
    for (const [packKey, packConfig] of Object.entries(appState.packConfig.packSizes)) {
        if (packKey === 'single') continue; // Skip single, we already checked
        
        // Use the same logic as canOrderFitInPackSize to ensure consistency
        if (canOrderFitInPackSize(order, packKey)) {
            return packConfig.name;
        }
    }
    
    return 'custom';
}

// Get all compatible pack sizes for an order
function getCompatiblePacks(order) {
    if (!appState.packConfig) return [];
    
    const items = order.items || [{ sku: order.itemSku, quantity: order.quantity }];
    const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const compatiblePacks = [];
    
    // If total quantity is 1, single pack is always compatible
    if (totalQuantity === 1) {
        compatiblePacks.push(appState.packConfig.packSizes.single.name);
    }
    
    // Check other pack sizes using the same logic as canOrderFitInPackSize
    for (const [packKey, packConfig] of Object.entries(appState.packConfig.packSizes)) {
        if (packKey === 'single') continue; // Skip single, we already checked
        
        if (canOrderFitInPackSize(order, packKey)) {
            compatiblePacks.push(packConfig.name);
        }
    }
    
    return compatiblePacks;
}

// Render box size orders table
function renderBoxSizeOrdersTable(orders, sizeFilter = 'all', packFilter = 'all') {
    const tbody = document.getElementById('boxSizeTableBody');
    
    if (!orders || orders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: #999;">
                    No orders found
                </td>
            </tr>
        `;
        return;
    }
    
    // Apply combined filters (item size + pack size)
    let filteredOrders = orders;
    
    // Use combined filtering logic when both filters are active
    if (sizeFilter !== 'all' && packFilter !== 'all') {
        console.log(`Applying combined filter: ${sizeFilter} + ${packFilter}`);
        filteredOrders = filteredOrders.filter(order => {
            return canOrderFitInCombinedFilter(order, sizeFilter, packFilter);
        });
    } else {
        // Apply individual filters when only one is active
        if (sizeFilter !== 'all') {
            filteredOrders = filteredOrders.filter(order => {
                const items = order.items || [{ sku: order.itemSku }];
                return items.some(item => {
                    const sku = item.sku || order.itemSku || '';
                    const itemSize = order.itemSize || '';
                    
                    if (sizeFilter === '10oz') {
                        return sku.startsWith('DPT10') || sku.startsWith('PT10') || itemSize.includes('10oz');
                    } else if (sizeFilter === '16oz') {
                        return sku.startsWith('DPT16') || sku.startsWith('PT16') || itemSize.includes('16oz');
                    } else if (sizeFilter === '26oz') {
                        return sku.startsWith('DPT26') || sku.startsWith('PT26') || itemSize.includes('26oz');
                    } else if (sizeFilter === 'stickers') {
                        return sku.startsWith('PL-STCK');
                    }
                    return false;
                });
            });
        }
        
        if (packFilter !== 'all') {
            const packConfig = appState.packConfig?.packSizes[packFilter];
            if (packConfig) {
                filteredOrders = filteredOrders.filter(order => {
                    return canOrderFitInPackSize(order, packFilter);
                });
            }
        }
    }
    
    tbody.innerHTML = filteredOrders.map(order => {
        const items = order.items || [{ sku: order.itemSku, quantity: order.quantity }];
        const itemsText = items.map(item => `${item.sku || order.itemSku} (${item.quantity || order.quantity})`).join(', ');
        const totalQty = order.totalQuantity || order.quantity || 0;
        const compatiblePacksText = order.compatiblePacks?.join(', ') || 'None';
        
        const salesOrderNumber = formatSalesOrderNumber(order.salesOrderId || order.id);
        const orderIdForButton = order.id || order.salesOrderId;
        
        console.log(`Rendering Box Size Specific order:`, {
            id: order.id,
            salesOrderId: order.salesOrderId,
            orderIdForButton: orderIdForButton,
            customerName: order.customerName
        });
        
        return `
            <tr>
                <td><strong>${salesOrderNumber}</strong></td>
                <td>${order.customerName || 'Unknown'}</td>
                <td class="items-cell">${itemsText}</td>
                <td>
                    <span class="pack-size-badge ${order.packSize?.toLowerCase().replace(' ', '-') || 'unknown'}">
                        ${order.packSize || 'Unknown'}
                    </span>
                </td>
                <td class="compatible-packs">${compatiblePacksText}</td>
                <td>${totalQty}</td>
                <td>
                    <span class="status-badge ${order.status?.toLowerCase() || 'fulfilled'}">
                        ${order.status || 'Fulfilled'}
                    </span>
                </td>
                <td>
                    <button class="btn-sm btn-primary view-order-btn" data-order-id="${orderIdForButton}" title="View Order Details">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Add event listeners to all view order buttons in Box Size Specific table
    setTimeout(() => {
        const viewOrderButtons = document.querySelectorAll('#boxSizeTableBody .view-order-btn');
        viewOrderButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const orderId = button.getAttribute('data-order-id');
                console.log(`Box Size Specific button clicked for order ID: ${orderId}`);
                showOrderDetails(orderId);
            });
        });
        console.log(`Added event listeners to ${viewOrderButtons.length} Box Size Specific view order buttons`);
    }, 100);
}

// Initialize box size filters
function initBoxSizeFilters(allOrders) {
    // Initialize size filters for box size page
    const sizeFilterButtons = document.querySelectorAll('#page-box-size .filter-btn');
    sizeFilterButtons.forEach(button => {
        button.addEventListener('click', () => {
            sizeFilterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            const sizeFilter = button.getAttribute('data-size');
            const packFilter = appState.currentPackFilter || 'all';
            
            renderBoxSizeOrdersTable(allOrders, sizeFilter, packFilter);
        });
    });
    
    // Initialize pack filters for box size page
    const packFilterButtons = document.querySelectorAll('#page-box-size .pack-filter-btn');
    packFilterButtons.forEach(button => {
        button.addEventListener('click', () => {
            packFilterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            const packFilter = button.getAttribute('data-pack');
            appState.currentPackFilter = packFilter;
            
            const sizeFilter = document.querySelector('#page-box-size .filter-btn.active')?.getAttribute('data-size') || 'all';
            renderBoxSizeOrdersTable(allOrders, sizeFilter, packFilter);
        });
    });
}

// Optimize order box (placeholder function)
function optimizeOrderBox(orderId) {
    console.log(`Optimizing box for order: ${orderId}`);
    showNotification(`Optimizing box configuration for order ${orderId}`, 'info');
}

// Initialize Modal
function initModal() {
    const modal = document.getElementById('orderModal');
    const closeModal = document.getElementById('closeModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const editOrderBtn = document.getElementById('editOrderBtn');
    
    // Close modal when clicking the X
    closeModal.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    // Close modal when clicking the Close button
    closeModalBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    // Close modal when clicking outside of it
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    // Handle Edit Order button
    editOrderBtn.addEventListener('click', () => {
        const orderId = editOrderBtn.dataset.orderId;
        console.log(`Editing order: ${orderId}`);
        showNotification(`Opening edit mode for order ${orderId}`, 'info');
        modal.style.display = 'none';
    });
}

// Initialize Batch Modal
function initBatchModal() {
    const batchModal = document.getElementById('batchModal');
    const closeBatchModal = document.getElementById('closeBatchModal');
    const cancelBatchBtn = document.getElementById('cancelBatchBtn');
    const createBatchBtn = document.getElementById('createBatchBtn');
    const batchOrdersBtn = document.getElementById('batch-orders-btn');
    const batchNameInput = document.getElementById('batchName');
    
    // Open batch modal when Batch Orders button is clicked
    if (batchOrdersBtn) {
        batchOrdersBtn.addEventListener('click', () => {
            // Count visible orders for batch info
            const visibleOrders = document.querySelectorAll('#boxSizeTableBody tr:not([style*="display: none"])');
            const orderCount = Math.max(0, visibleOrders.length - 1); // Subtract 1 for header row
            
            document.getElementById('batchOrderCount').textContent = `${orderCount} orders selected`;
            batchModal.style.display = 'block';
            batchNameInput.focus();
        });
    }
    
    // Close modal when clicking the X
    closeBatchModal.addEventListener('click', () => {
        batchModal.style.display = 'none';
        batchNameInput.value = '';
        clearBatchModalData(batchModal);
    });
    
    // Close modal when clicking Cancel button
    cancelBatchBtn.addEventListener('click', () => {
        batchModal.style.display = 'none';
        batchNameInput.value = '';
        clearBatchModalData(batchModal);
    });
    
    // Close modal when clicking outside of it
    window.addEventListener('click', (event) => {
        if (event.target === batchModal) {
            batchModal.style.display = 'none';
            batchNameInput.value = '';
            clearBatchModalData(batchModal);
        }
    });
    
    // Handle Create Batch button
    createBatchBtn.addEventListener('click', () => {
        const batchName = batchNameInput.value.trim();
        
        if (!batchName) {
            showNotification('Please enter a batch name', 'error');
            batchNameInput.focus();
            return;
        }
        
        if (batchName.length < 3) {
            showNotification('Batch name must be at least 3 characters long', 'error');
            batchNameInput.focus();
            return;
        }
        
        // Create the batch with stored orders
        createBatchFromModal(batchName, batchModal);
        
        // Close modal and reset
        batchModal.style.display = 'none';
        batchNameInput.value = '';
        
        // Clear stored data
        delete batchModal.dataset.orders;
        delete batchModal.dataset.orderType;
        delete batchModal.dataset.groupNumber;
    });
    
    // Allow Enter key to create batch
    batchNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            createBatchBtn.click();
        }
    });
}

// Clear Batch Modal Data
function clearBatchModalData(batchModal) {
    delete batchModal.dataset.orders;
    delete batchModal.dataset.orderType;
    delete batchModal.dataset.groupNumber;
}

// Create Batch From Modal
function createBatchFromModal(batchName, batchModal) {
    // Get stored orders from modal
    const storedOrders = batchModal.dataset.orders;
    const orderType = batchModal.dataset.orderType;
    
    let orders = [];
    
    if (storedOrders) {
        // Use stored orders (from singles or bulk groups)
        orders = JSON.parse(storedOrders);
    } else {
        // Fallback to Box Size Specific orders (original behavior)
        const visibleRows = document.querySelectorAll('#boxSizeTableBody tr:not([style*="display: none"])');
        visibleRows.forEach(row => {
            const orderId = row.querySelector('td:first-child strong')?.textContent;
            if (orderId) {
                orders.push(orderId);
            }
        });
    }
    
    if (orders.length === 0) {
        showNotification('No orders selected for batching', 'warning');
        return;
    }
    
    // Create batch object
    const batch = {
        id: `batch_${Date.now()}`,
        name: batchName,
        createdAt: new Date().toISOString(),
        orderCount: orders.length,
        orders: orders,
        orderType: orderType || 'box-size'
    };
    
    // Store batch in appState
    if (!appState.batches) {
        appState.batches = [];
    }
    appState.batches.push(batch);
    
    // Show success message
    const orderTypeText = orderType === 'singles' ? 'singles orders' : 
                         orderType === 'bulk' ? 'bulk orders' : 'orders';
    showNotification(`Batch "${batchName}" created successfully with ${orders.length} ${orderTypeText}!`, 'success');
    
    console.log('Batch created:', batch);
}

// Create Batch Function (Legacy - for Box Size Specific)
function createBatch(batchName) {
    // Get all visible orders from the current table
    const visibleRows = document.querySelectorAll('#boxSizeTableBody tr:not([style*="display: none"])');
    const orders = [];
    
    visibleRows.forEach(row => {
        const orderId = row.querySelector('td:first-child strong')?.textContent;
        if (orderId) {
            orders.push(orderId);
        }
    });
    
    if (orders.length === 0) {
        showNotification('No orders selected for batching', 'warning');
        return;
    }
    
    // Create batch object
    const batch = {
        id: `batch_${Date.now()}`,
        name: batchName,
        createdAt: new Date().toISOString(),
        orderCount: orders.length,
        orders: orders
    };
    
    // Store batch in appState (in a real app, this would be sent to a server)
    if (!appState.batches) {
        appState.batches = [];
    }
    appState.batches.push(batch);
    
    // Show success message
    showNotification(`Batch "${batchName}" created successfully with ${orders.length} orders!`, 'success');
    
    console.log('Batch created:', batch);
    
    // In a real application, you would:
    // 1. Send the batch data to your backend API
    // 2. Update the UI to show batch status
    // 3. Redirect to batch management page
}

// Create Batch From Singles Orders
function createBatchFromSinglesOrders() {
    // Get currently visible singles orders from the table
    const visibleRows = document.querySelectorAll('#singlesOrdersTableBody tr:not([style*="display: none"])');
    const orders = [];
    
    visibleRows.forEach(row => {
        const orderId = row.querySelector('td:first-child strong')?.textContent;
        if (orderId) {
            orders.push(orderId);
        }
    });
    
    if (orders.length === 0) {
        showNotification('No singles orders selected for batching', 'warning');
        return;
    }
    
    // Open the batch modal with singles orders count
    const batchModal = document.getElementById('batchModal');
    const batchNameInput = document.getElementById('batchName');
    const batchOrderCount = document.getElementById('batchOrderCount');
    
    // Update the modal to show singles orders
    batchOrderCount.textContent = `${orders.length} singles orders selected`;
    
    // Store the orders for when the batch is created
    batchModal.dataset.orders = JSON.stringify(orders);
    batchModal.dataset.orderType = 'singles';
    
    // Show the modal
    batchModal.style.display = 'block';
    batchNameInput.focus();
}

// Create Batch From Bulk Group
function createBatchFromBulkGroup(group, groupNumber) {
    // Get order IDs from the bulk group
    const orders = group.orders.map(order => order.orderId);
    
    if (orders.length === 0) {
        showNotification('No orders in this bulk group', 'warning');
        return;
    }
    
    // Open the batch modal with bulk group info
    const batchModal = document.getElementById('batchModal');
    const batchNameInput = document.getElementById('batchName');
    const batchOrderCount = document.getElementById('batchOrderCount');
    
    // Update the modal to show bulk group info
    batchOrderCount.textContent = `Bulk Group ${groupNumber}: ${orders.length} orders`;
    
    // Store the orders for when the batch is created
    batchModal.dataset.orders = JSON.stringify(orders);
    batchModal.dataset.orderType = 'bulk';
    batchModal.dataset.groupNumber = groupNumber;
    
    // Show the modal
    batchModal.style.display = 'block';
    batchNameInput.focus();
}

// Show Order Details Modal
function showOrderDetails(orderId) {
    console.log(`=== SHOW ORDER DETAILS CALLED ===`);
    console.log(`Order ID received: "${orderId}"`);
    console.log('Available orders in appState:', {
        singleItemOrders: appState.singleItemOrders.length,
        orders: appState.orders.length,
        fulfillments: appState.fulfillments.length,
        processedBoxSizeOrders: appState.processedBoxSizeOrders?.length || 0,
        processedAllOrders: appState.processedAllOrders?.length || 0
    });
    
    // Find the order in our data
    const order = findOrderById(orderId);
    if (!order) {
        console.log(`Order ${orderId} not found in any data arrays`);
        console.log('Sample singleItemOrders IDs:', appState.singleItemOrders.slice(0, 3).map(o => ({ id: o.id, salesOrderId: o.salesOrderId })));
        console.log('Sample orders IDs:', appState.orders.slice(0, 3).map(o => ({ id: o.id, salesOrderId: o.salesOrderId })));
        showNotification(`Order ${orderId} not found`, 'error');
        return;
    }
    
    // Populate modal title
    const modalTitle = document.getElementById('modalOrderTitle');
    const salesOrderNumber = formatSalesOrderNumber(order.salesOrderId || order.id);
    modalTitle.textContent = `Order ${salesOrderNumber} Details`;
    
    // Populate modal body
    const modalBody = document.getElementById('modalOrderBody');
    modalBody.innerHTML = generateOrderDetailsHTML(order);
    
    // Set order ID for edit button
    const editOrderBtn = document.getElementById('editOrderBtn');
    editOrderBtn.dataset.orderId = orderId;
    
    // Show modal
    const modal = document.getElementById('orderModal');
    modal.style.display = 'block';
}

// Find order by ID across all order types
function findOrderById(orderId) {
    // Check singles orders
    let order = appState.singleItemOrders.find(o => o.id === orderId || o.salesOrderId === orderId);
    if (order) return order;
    
    // Check bulk orders
    order = appState.orders.find(o => o.id === orderId || o.salesOrderId === orderId);
    if (order) return order;
    
    // Check fulfillments
    order = appState.fulfillments.find(f => f.id === orderId || f.salesOrderId === orderId);
    if (order) return order;
    
    // Check if we have processed orders stored (for Box Size Specific page)
    if (appState.processedBoxSizeOrders) {
        order = appState.processedBoxSizeOrders.find(o => o.id === orderId || o.salesOrderId === orderId);
        if (order) return order;
    }
    
    // Check if we have processed orders stored (for All Orders page)
    if (appState.processedAllOrders) {
        order = appState.processedAllOrders.find(o => o.id === orderId || o.salesOrderId === orderId);
        if (order) return order;
    }
    
    return null;
}

// Format Sales Order Number
function formatSalesOrderNumber(orderId) {
    if (!orderId) return 'N/A';
    
    // If it already starts with SO, return as is
    if (orderId.toString().startsWith('SO')) {
        return orderId.toString();
    }
    
    // Otherwise, format as SO######
    const numericId = orderId.toString().replace(/\D/g, '');
    if (numericId) {
        return `SO${numericId.padStart(6, '0')}`;
    }
    
    return orderId.toString();
}

// Generate Order Details HTML
function generateOrderDetailsHTML(order) {
    const salesOrderNumber = formatSalesOrderNumber(order.salesOrderId || order.id);
    const items = order.items || [{ sku: order.itemSku, quantity: order.quantity, name: order.itemName }];
    const totalQty = order.totalQuantity || order.quantity || 0;
    const shipDate = formatDate(order.shipDate || order.createdDate || '');
    const orderDate = formatDate(order.orderDate || order.createdDate || '');
    
    return `
        <div class="order-details-grid">
            <div class="order-detail-section">
                <h3>Order Information</h3>
                <div class="order-detail-item">
                    <span class="order-detail-label">Sales Order #:</span>
                    <span class="order-detail-value">${salesOrderNumber}</span>
                </div>
                <div class="order-detail-item">
                    <span class="order-detail-label">Customer:</span>
                    <span class="order-detail-value">${order.customerName || 'Unknown'}</span>
                </div>
                <div class="order-detail-item">
                    <span class="order-detail-label">Customer ID:</span>
                    <span class="order-detail-value">${order.customerId || 'N/A'}</span>
                </div>
                <div class="order-detail-item">
                    <span class="order-detail-label">Order Date:</span>
                    <span class="order-detail-value">${orderDate}</span>
                </div>
                <div class="order-detail-item">
                    <span class="order-detail-label">Ship Date:</span>
                    <span class="order-detail-value">${shipDate}</span>
                </div>
            </div>
            
            <div class="order-detail-section">
                <h3>Order Status</h3>
                <div class="order-detail-item">
                    <span class="order-detail-label">Status:</span>
                    <span class="order-detail-value">
                        <span class="status-badge ${order.status?.toLowerCase() || 'fulfilled'}">
                            ${order.status || 'Fulfilled'}
                        </span>
                    </span>
                </div>
                <div class="order-detail-item">
                    <span class="order-detail-label">Total Quantity:</span>
                    <span class="order-detail-value">${totalQty}</span>
                </div>
                <div class="order-detail-item">
                    <span class="order-detail-label">Ship Method:</span>
                    <span class="order-detail-value">${order.shipMethod || 'Standard'}</span>
                </div>
                <div class="order-detail-item">
                    <span class="order-detail-label">Urgency:</span>
                    <span class="order-detail-value">${order.urgency || 'Normal'}</span>
                </div>
                <div class="order-detail-item">
                    <span class="order-detail-label">Order Class:</span>
                    <span class="order-detail-value">${order.orderClass || 'Standard'}</span>
                </div>
            </div>
        </div>
        
        <div class="order-items-list">
            <h3>Order Items</h3>
            ${items.map(item => `
                <div class="order-item">
                    <div>
                        <div class="order-item-sku">${item.sku || order.itemSku}</div>
                        <div class="order-item-name">${item.name || item.itemName || order.itemName || 'Unknown Item'}</div>
                    </div>
                    <div class="order-item-qty">${item.quantity || order.quantity}</div>
                    <div class="order-item-size">${order.itemSize || getProductSizeFromSku(item.sku || order.itemSku) || 'N/A'}</div>
                </div>
            `).join('')}
        </div>
        
        ${order.packSize || order.compatiblePacks ? `
            <div class="pack-compatibility">
                <h3>Pack Compatibility</h3>
                <div class="order-detail-item">
                    <span class="order-detail-label">Optimal Pack Size:</span>
                    <span class="order-detail-value">
                        <span class="pack-size-badge ${order.packSize?.toLowerCase().replace(' ', '-') || 'unknown'}">
                            ${order.packSize || 'Unknown'}
                        </span>
                    </span>
                </div>
                ${order.compatiblePacks && order.compatiblePacks.length > 0 ? `
                    <div style="margin-top: 12px;">
                        <span class="order-detail-label">All Compatible Packs:</span>
                        <div class="compatible-pack-list" style="margin-top: 8px;">
                            ${order.compatiblePacks.map(pack => `
                                <span class="compatible-pack-item ${pack === order.packSize ? 'optimal' : ''}">
                                    ${pack}
                                </span>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        ` : ''}
        
        ${order.shipAddress ? `
            <div class="order-detail-section" style="margin-top: 24px;">
                <h3>Shipping Address</h3>
                <div style="font-size: 13px; color: var(--text-primary); line-height: 1.5;">
                    ${order.shipAddress.replace(/\n/g, '<br>')}
                </div>
            </div>
        ` : ''}
        
        ${order.memo || order.warehouseNote ? `
            <div class="order-detail-section" style="margin-top: 24px;">
                <h3>Notes</h3>
                ${order.memo ? `<div style="margin-bottom: 8px;"><strong>Memo:</strong> ${order.memo}</div>` : ''}
                ${order.warehouseNote ? `<div><strong>Warehouse Note:</strong> ${order.warehouseNote}</div>` : ''}
            </div>
        ` : ''}
    `;
}

// Search Functionality
function initSearch() {
    const searchInput = document.getElementById('searchInput');
    let debounceTimer;
    
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const query = e.target.value.toLowerCase();
            if (query.length > 2) {
                performSearch(query);
            }
        }, 300);
    });
}

function performSearch(query) {
    console.log(`Searching for: ${query}`);
    // You can implement search logic here
    // For now, it just logs the search query
}

// Load Dashboard Data
async function loadDashboardData() {
    try {
        // Load summary data
        const summaryResponse = await fetch(`${API_BASE}/summary`);
        const summary = await summaryResponse.json();
        appState.summary = summary;
        
        // Update stats cards
        updateStatsCards(summary);
        
        // Load orders
        const ordersResponse = await fetch(`${API_BASE}/orders`);
        const orders = await ordersResponse.json();
        appState.orders = orders;
        
        // Update orders table
        updateOrdersTable(orders.slice(0, 5)); // Show first 5
        
        // Load inventory for stock numbers
        const inventoryResponse = await fetch(`${API_BASE}/inventory`);
        const inventory = await inventoryResponse.json();
        appState.inventory = inventory;
        
        // Update stock numbers
        updateStockNumbers(inventory);
        
        // Load fulfillments for chart (load all records)
        const fulfillmentsResponse = await fetch(`${API_BASE}/fulfillments?limit=1000`);
        const fulfillmentsData = await fulfillmentsResponse.json();
        appState.fulfillments = fulfillmentsData.fulfillments || [];
        
        // Pre-categorize orders for mutual exclusivity
        // This ensures Singles are identified first, then Bulk, then High Volume
        categorizeSinglesOrders();
        
        // Create chart
        createSalesChart(appState.fulfillments);
        
        // Reload the current page now that data is loaded
        loadPageData(appState.currentPage);
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        // Show error message to user
        showError('Failed to load dashboard data. Please check if the server is running.');
    }
}

// Update Stats Cards
function updateStatsCards(summary) {
    document.getElementById('statFulfillments').textContent = summary.totalFulfillments || 0;
    document.getElementById('statOrders').textContent = summary.totalOrders || 0;
    document.getElementById('statItems').textContent = summary.totalItems || 0;
    document.getElementById('statCustomers').textContent = summary.totalCustomers || 0;
}

// Update Orders Table
function updateOrdersTable(orders) {
    const tbody = document.getElementById('ordersTableBody');
    tbody.innerHTML = '';
    
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px; color: #999;">No orders found</td></tr>';
        return;
    }
    
    orders.forEach(order => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${order.id}</strong></td>
            <td>${order.customerName}</td>
            <td>${order.totalQuantity || order.items?.length || 0}</td>
            <td><span class="status-badge">${order.status}</span></td>
        `;
        tbody.appendChild(row);
    });
}

// Update Stock Numbers
function updateStockNumbers(inventory) {
    const lowStockItems = inventory.filter(item => item.totalFulfilled < 10).length;
    const categories = new Set(inventory.map(item => item.color).filter(c => c)).size;
    
    document.getElementById('lowStockCount').textContent = lowStockItems;
    document.getElementById('categoryCount').textContent = categories;
    document.getElementById('totalItemsCount').textContent = inventory.length;
}

// Create Sales Chart
function createSalesChart(fulfillments) {
    const canvas = document.getElementById('salesChart');
    const ctx = canvas.getContext('2d');
    
    // Process data for chart
    const statusCounts = processChartData(fulfillments);
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(statusCounts),
            datasets: [{
                label: 'Fulfillments',
                data: Object.values(statusCounts),
                backgroundColor: '#6e6e73',
                borderRadius: 8,
                barThickness: 40
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: '#e5e5e7',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#6e6e73',
                        font: {
                            size: 12
                        }
                    }
                },
                x: {
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: '#1d1d1f',
                        font: {
                            size: 13,
                            weight: '600'
                        }
                    }
                }
            }
        }
    });
}

// Process Chart Data
function processChartData(fulfillments) {
    // Group by urgency or create sample data
    const urgencyMap = {
        'Confirmed': 0,
        'Packed': 0,
        'Refunded': 0,
        'Shipped': fulfillments.length
    };
    
    // Count by urgency
    fulfillments.forEach(fulfillment => {
        const urgency = fulfillment.urgency || 'Normal';
        if (urgency.includes('Expedite')) {
            urgencyMap['Shipped'] += 1;
        }
    });
    
    // Create more realistic distribution
    return {
        'Confirmed': Math.floor(fulfillments.length * 0.3),
        'Packed': Math.floor(fulfillments.length * 0.5),
        'Refunded': Math.floor(fulfillments.length * 0.05),
        'Shipped': fulfillments.length
    };
}

// Error Handling
function showError(message) {
    const contentArea = document.querySelector('.content-area');
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: #ff3b30;
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 1000;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

// Show Notification Function
function showNotification(message, type = 'info') {
    const notificationDiv = document.createElement('div');
    
    // Set background color based on type
    let backgroundColor;
    switch (type) {
        case 'success':
            backgroundColor = '#22c55e';
            break;
        case 'error':
            backgroundColor = '#ef4444';
            break;
        case 'warning':
            backgroundColor = '#f59e0b';
            break;
        case 'info':
        default:
            backgroundColor = '#3b82f6';
            break;
    }
    
    notificationDiv.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${backgroundColor};
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 1000;
        max-width: 400px;
        font-weight: 500;
    `;
    
    notificationDiv.textContent = message;
    document.body.appendChild(notificationDiv);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        if (notificationDiv.parentNode) {
            notificationDiv.remove();
        }
    }, 4000);
}

// Load All Orders
function loadAllOrders() {
    console.log('Loading all orders...');
    
    // Get all orders from the processed data
    const allOrders = [];
    
    // Collect singles orders
    appState.singleItemOrders.forEach(order => {
        allOrders.push({
            ...order,
            category: 'Singles',
            categoryClass: 'singles'
        });
    });
    
    // Collect bulk orders
    appState.orders.forEach(order => {
        if (order.items.length > 1 && !appState.singlesOrderIds.has(order.id) && !appState.highVolumeOrderIds.has(order.id)) {
            allOrders.push({
                ...order,
                category: 'Bulk',
                categoryClass: 'bulk'
            });
        }
    });
    
    // Collect high volume orders (orders with same SKU appearing multiple times)
    const highVolumeMap = new Map();
    appState.orders.forEach(order => {
        order.items.forEach(item => {
            if (!highVolumeMap.has(item.sku)) {
                highVolumeMap.set(item.sku, []);
            }
            highVolumeMap.get(item.sku).push(order);
        });
    });
    
    highVolumeMap.forEach((orders, sku) => {
        if (orders.length > 1) {
            orders.forEach(order => {
                if (!allOrders.find(o => o.id === order.id)) {
                    allOrders.push({
                        ...order,
                        category: 'High Volume',
                        categoryClass: 'high-volume'
                    });
                }
            });
        }
    });
    
    // Collect unique orders (mixed items, not fitting other categories)
    appState.orders.forEach(order => {
        if (order.items.length > 1 && 
            !appState.singlesOrderIds.has(order.id) && 
            !appState.highVolumeOrderIds.has(order.id) &&
            !allOrders.find(o => o.id === order.id)) {
            allOrders.push({
                ...order,
                category: 'Unique',
                categoryClass: 'unique'
            });
        }
    });
    
    // Sort by date (most recent first)
    allOrders.sort((a, b) => new Date(b.orderDate || b.createdDate) - new Date(a.orderDate || a.createdDate));
    
    // Store processed orders in appState so they can be found by findOrderById
    appState.processedAllOrders = allOrders;
    
    renderAllOrdersTable(allOrders);
    initAllOrdersFilters(allOrders);
}

// Render All Orders Table
function renderAllOrdersTable(orders, filter = 'all') {
    const tbody = document.getElementById('allOrdersTableBody');
    
    if (!orders || orders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: #999;">
                    No orders found
                </td>
            </tr>
        `;
        return;
    }
    
    // Filter orders based on selected filter
    let filteredOrders = orders;
    if (filter !== 'all') {
        filteredOrders = orders.filter(order => order.categoryClass === filter);
    }
    
    tbody.innerHTML = filteredOrders.map(order => {
        const itemsText = order.items ? 
            order.items.map(item => `${item.sku} (${item.quantity})`).join(', ') : 
            `${order.itemSku} (${order.quantity})`;
        
        const totalQty = order.totalQuantity || order.quantity || 0;
        const shipDate = order.shipDate || order.createdDate || '';
        
        const salesOrderNumber = formatSalesOrderNumber(order.salesOrderId || order.id);
        
        return `
            <tr>
                <td><strong>${salesOrderNumber}</strong></td>
                <td>${order.customerName || 'Unknown'}</td>
                <td>
                    <span class="category-badge ${order.categoryClass}">
                        ${order.category}
                    </span>
                </td>
                <td class="items-cell">${itemsText}</td>
                <td>${totalQty}</td>
                <td>${formatDate(shipDate)}</td>
                <td>
                    <span class="status-badge ${order.status?.toLowerCase() || 'fulfilled'}">
                        ${order.status || 'Fulfilled'}
                    </span>
                </td>
                <td>
                    <button class="btn-sm btn-primary view-order-btn" data-order-id="${order.id || order.salesOrderId}" title="View Order Details">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Add event listeners to all view order buttons in All Orders table
    setTimeout(() => {
        const viewOrderButtons = document.querySelectorAll('#allOrdersTableBody .view-order-btn');
        viewOrderButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const orderId = button.getAttribute('data-order-id');
                console.log(`All Orders button clicked for order ID: ${orderId}`);
                showOrderDetails(orderId);
            });
        });
        console.log(`Added event listeners to ${viewOrderButtons.length} All Orders view order buttons`);
    }, 100);
}

// Initialize All Orders Filters
function initAllOrdersFilters(allOrders) {
    // Initialize category filters
    const filterButtons = document.querySelectorAll('#page-all-orders .filter-btn');
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active state
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Get filter value
            const filter = button.getAttribute('data-filter');
            
            // Re-render table with filter
            renderAllOrdersTable(allOrders, filter);
        });
    });
    
    // Initialize pack filters
    const packFilterButtons = document.querySelectorAll('#page-all-orders .pack-filter-btn');
    packFilterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active state
            packFilterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Get filter values
            const packFilter = button.getAttribute('data-pack');
            const categoryFilter = document.querySelector('#page-all-orders .filter-btn.active')?.getAttribute('data-filter') || 'all';
            
            // Re-render table with filters
            renderAllOrdersTableWithPackFilter(allOrders, categoryFilter, packFilter);
        });
    });
}

// Render All Orders Table with Pack Filter
function renderAllOrdersTableWithPackFilter(orders, categoryFilter = 'all', packFilter = 'all') {
    const tbody = document.getElementById('allOrdersTableBody');
    
    if (!orders || orders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: #999;">
                    No orders found
                </td>
            </tr>
        `;
        return;
    }
    
    // Apply category filter first
    let filteredOrders = orders;
    if (categoryFilter !== 'all') {
        filteredOrders = orders.filter(order => order.categoryClass === categoryFilter);
    }
    
    // Apply pack filter
    if (packFilter !== 'all') {
        const packConfig = appState.packConfig?.packSizes[packFilter];
        if (packConfig) {
            filteredOrders = filteredOrders.filter(order => {
                return canOrderFitInPackSize(order, packFilter);
            });
        }
    }
    
    tbody.innerHTML = filteredOrders.map(order => {
        const itemsText = order.items ? 
            order.items.map(item => `${item.sku} (${item.quantity})`).join(', ') : 
            `${order.itemSku} (${order.quantity})`;
        
        const totalQty = order.totalQuantity || order.quantity || 0;
        const shipDate = order.shipDate || order.createdDate || '';
        const salesOrderNumber = formatSalesOrderNumber(order.salesOrderId || order.id);
        
        return `
            <tr>
                <td><strong>${salesOrderNumber}</strong></td>
                <td>${order.customerName || 'Unknown'}</td>
                <td>
                    <span class="category-badge ${order.categoryClass}">
                        ${order.category}
                    </span>
                </td>
                <td class="items-cell">${itemsText}</td>
                <td>${totalQty}</td>
                <td>${formatDate(shipDate)}</td>
                <td>
                    <span class="status-badge ${order.status?.toLowerCase() || 'fulfilled'}">
                        ${order.status || 'Fulfilled'}
                    </span>
                </td>
                <td>
                    <button class="btn-sm btn-primary view-order-btn" data-order-id="${order.id || order.salesOrderId}" title="View Order Details">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Add event listeners to all view order buttons in All Orders table with pack filter
    setTimeout(() => {
        const viewOrderButtons = document.querySelectorAll('#allOrdersTableBody .view-order-btn');
        viewOrderButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const orderId = button.getAttribute('data-order-id');
                console.log(`All Orders (pack filter) button clicked for order ID: ${orderId}`);
                showOrderDetails(orderId);
            });
        });
        console.log(`Added event listeners to ${viewOrderButtons.length} All Orders (pack filter) view order buttons`);
    }, 100);
}

// Utility Functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
    });
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD' 
    }).format(amount);
}

// Export for potential use
window.appState = appState;
window.loadDashboardData = loadDashboardData;
