const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// These need to be imported differently since they're TS files
// We'll implement the logic inline

async function matchSkuToSize(sku) {
  if (!sku) return null;
  const upperSku = sku.toUpperCase();

  // Try exact match
  const skuRecord = await prisma.productSku.findUnique({
    where: { sku: upperSku },
    include: { productSize: true },
  });

  if (skuRecord?.active && skuRecord.productSize?.active) {
    return addVolume(skuRecord.productSize);
  }

  // Try original case
  const skuRecordOrig = await prisma.productSku.findUnique({
    where: { sku },
    include: { productSize: true },
  });

  if (skuRecordOrig?.active && skuRecordOrig.productSize?.active) {
    return addVolume(skuRecordOrig.productSize);
  }

  // Try regex patterns
  const patterns = await prisma.productSkuPattern.findMany({
    include: { productSize: true },
  });

  for (const p of patterns) {
    if (!p.productSize?.active) continue;
    try {
      const regex = new RegExp(p.pattern, 'i');
      if (regex.test(sku)) {
        return addVolume(p.productSize);
      }
    } catch {
      continue;
    }
  }

  return null;
}

function addVolume(size) {
  return {
    ...size,
    volume: size.lengthInches * size.widthInches * size.heightInches,
  };
}

async function backfill() {
  console.log('Loading config...');

  const boxes = await prisma.box.findMany({ where: { active: true } });
  const sizes = await prisma.productSize.findMany();

  console.log('Active boxes:', boxes.length);
  console.log('Product sizes:', sizes.length);

  // Get ALL orders to recalculate with 100% efficiency
  const orders = await prisma.orderLog.findMany({
    select: { id: true, orderNumber: true, rawPayload: true, suggestedBox: true },
  });

  console.log('Orders to update:', orders.length);

  let updated = 0;
  let noFit = 0;

  for (const order of orders) {
    const items = order.rawPayload?.items || [];

    // Filter insurance
    const realItems = items.filter(i => {
      const sku = (i.sku || '').toUpperCase();
      const name = (i.name || '').toUpperCase();
      return !sku.includes('INSURANCE') && !sku.includes('SHIPPING') && !name.includes('INSURANCE');
    });

    if (realItems.length === 0) {
      await prisma.orderLog.update({
        where: { id: order.id },
        data: { suggestedBox: { boxId: null, boxName: null, confidence: 'unknown' } },
      });
      noFit++;
      continue;
    }

    // Map SKUs to sizes
    const mappedItems = [];
    for (const item of realItems) {
      const size = await matchSkuToSize(item.sku);
      if (size) {
        mappedItems.push({ productId: size.id, quantity: Number(item.quantity) || 1, size });
      }
    }

    let suggestedBox = { boxId: null, boxName: null, confidence: 'unknown' };

    if (mappedItems.length > 0) {
      // Check for single item with dedicated box
      const totalQty = mappedItems.reduce((sum, i) => sum + i.quantity, 0);
      if (mappedItems.length === 1 && totalQty === 1) {
        const singleSize = mappedItems[0].size;
        if (singleSize.singleBoxId) {
          const dedicatedBox = boxes.find(b => b.id === singleSize.singleBoxId && b.active);
          if (dedicatedBox) {
            suggestedBox = { boxId: dedicatedBox.id, boxName: dedicatedBox.name, confidence: 'confirmed', reason: 'dedicated-box' };
          }
        }
      }

      // If no dedicated box, try to find best fit by volume
      if (!suggestedBox.boxId) {
        // Calculate total volume needed
        let totalVolume = 0;
        for (const item of mappedItems) {
          totalVolume += (item.size.volume || 0) * item.quantity;
        }

        // Apply packing efficiency (100% - box dims are internal)
        const neededVolume = totalVolume / 1.0;

        // Find smallest box that fits
        const sortedBoxes = boxes
          .map(b => ({
            ...b,
            volume: b.lengthInches * b.widthInches * b.heightInches,
          }))
          .sort((a, b) => a.volume - b.volume);

        const fittingBox = sortedBoxes.find(b => b.volume >= neededVolume);

        if (fittingBox) {
          suggestedBox = {
            boxId: fittingBox.id,
            boxName: fittingBox.name,
            confidence: 'calculated',
          };
        }
      }
    }

    await prisma.orderLog.update({
      where: { id: order.id },
      data: { suggestedBox },
    });

    if (suggestedBox.boxName) {
      updated++;
    } else {
      noFit++;
    }

    if ((updated + noFit) % 20 === 0) {
      console.log('Progress:', updated + noFit, '/', orders.length);
    }
  }

  console.log('Done!');
  console.log('  With box:', updated);
  console.log('  No fit:', noFit);

  await prisma.$disconnect();
}

backfill().catch(e => {
  console.error(e);
  process.exit(1);
});
