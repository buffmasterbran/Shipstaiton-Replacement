import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/scan-to-verify/reference-data
 *
 * Returns ALL reference data needed for the Scan to Verify page in a single call:
 *   - boxes (active only, with dimensions and weight)
 *   - locations (active only)
 *   - carrier services (from saved settings)
 *   - SKU → barcode map (all active SKUs)
 *   - SKU → weight map (all active SKUs with their product size weight)
 *   - SKU regex patterns (for SKUs that don't have exact matches)
 *
 * This data is loaded ONCE on page mount and cached in the browser.
 * The order lookup then only needs a single DB query (find the order).
 */
export async function GET() {
  try {
    // Run ALL queries in parallel — one round trip
    const [boxes, locations, settings, skuRecords, patterns] = await Promise.all([
      // Active boxes
      prisma.box.findMany({
        where: { active: true },
        orderBy: { priority: 'asc' },
      }),

      // Active locations
      prisma.location.findMany({
        where: { active: true },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      }),

      // App settings (for selected_services)
      prisma.appSetting.findMany(),

      // ALL active SKU records with their product sizes (for barcodes + weights)
      prisma.productSku.findMany({
        where: { active: true },
        include: { productSize: true },
      }),

      // ALL regex patterns with their product sizes
      prisma.productSkuPattern.findMany({
        include: { productSize: true },
      }),
    ])

    // Build SKU → barcode map
    const skuBarcodeMap: Record<string, string> = {}
    for (const rec of skuRecords) {
      if (rec.barcode) {
        skuBarcodeMap[rec.sku] = rec.barcode
        // Also map uppercased version for case-insensitive matching
        const upper = rec.sku.toUpperCase()
        if (upper !== rec.sku) {
          skuBarcodeMap[upper] = rec.barcode
        }
      }
    }

    // Build SKU → weight map (from exact matches)
    const skuWeightMap: Record<string, number> = {}
    for (const rec of skuRecords) {
      if (rec.productSize?.active) {
        skuWeightMap[rec.sku] = rec.productSize.weightLbs
        const upper = rec.sku.toUpperCase()
        if (upper !== rec.sku) {
          skuWeightMap[upper] = rec.productSize.weightLbs
        }
      }
    }

    // Build regex patterns array for client-side matching
    const skuPatterns = patterns
      .filter(p => p.productSize?.active)
      .map(p => ({
        pattern: p.pattern,
        weightLbs: p.productSize!.weightLbs,
      }))

    // Extract selected services from settings
    const selectedServicesSetting = settings.find(s => s.key === 'selected_services')
    const carrierServices = (selectedServicesSetting?.value as any)?.services || []

    // Build box map for quick lookup (id → box data)
    const boxMap: Record<string, {
      id: string
      name: string
      lengthInches: number
      widthInches: number
      heightInches: number
      weightLbs: number
    }> = {}
    for (const box of boxes) {
      boxMap[box.id] = {
        id: box.id,
        name: box.name,
        lengthInches: box.lengthInches,
        widthInches: box.widthInches,
        heightInches: box.heightInches,
        weightLbs: box.weightLbs,
      }
    }

    return NextResponse.json({
      boxes: boxes.map(b => ({
        id: b.id,
        name: b.name,
        lengthInches: b.lengthInches,
        widthInches: b.widthInches,
        heightInches: b.heightInches,
        weightLbs: b.weightLbs,
        active: b.active,
      })),
      boxMap,
      locations,
      carrierServices,
      skuBarcodeMap,
      skuWeightMap,
      skuPatterns,
    })
  } catch (err) {
    console.error('Reference data error:', err)
    return NextResponse.json({ error: 'Failed to load reference data' }, { status: 500 })
  }
}
