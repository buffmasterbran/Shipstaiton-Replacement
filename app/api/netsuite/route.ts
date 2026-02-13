import { NextRequest, NextResponse } from 'next/server'
import {
  isNetSuiteConfigured,
  getItemFulfillment,
  updateItemFulfillment,
  FulfillmentPackage,
} from '@/lib/netsuite'

// ============================================================================
// POST - NetSuite Item Fulfillment operations
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    if (!isNetSuiteConfigured()) {
      return NextResponse.json(
        { error: 'NetSuite is not configured. Add NETSUITE_* environment variables.' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { action } = body

    // ---- Get Item Fulfillment (for testing / viewing) ----
    if (action === 'get-fulfillment') {
      const { internalId } = body
      if (!internalId) {
        return NextResponse.json({ error: 'internalId is required' }, { status: 400 })
      }

      const result = await getItemFulfillment(String(internalId))
      return NextResponse.json({
        success: result.status >= 200 && result.status < 300,
        status: result.status,
        data: result.data,
        raw: result.raw,
      })
    }

    // ---- Update Item Fulfillment (push shipping info) ----
    if (action === 'update-fulfillment') {
      const {
        internalId,
        trackingNumber,
        carrier,
        shippingMethod,
        shippingCost,
        packages,
        memo,
      } = body

      if (!internalId) {
        return NextResponse.json({ error: 'internalId is required' }, { status: 400 })
      }
      if (!trackingNumber) {
        return NextResponse.json({ error: 'trackingNumber is required' }, { status: 400 })
      }

      // Build packages array
      const pkgs: FulfillmentPackage[] = (packages || []).map((pkg: any) => ({
        packageWeight: parseFloat(pkg.packageWeight) || 0,
        packageTrackingNumber: pkg.packageTrackingNumber || trackingNumber,
        packageDescr: pkg.packageDescr || '',
        packageLength: pkg.packageLength ? parseFloat(pkg.packageLength) : undefined,
        packageWidth: pkg.packageWidth ? parseFloat(pkg.packageWidth) : undefined,
        packageHeight: pkg.packageHeight ? parseFloat(pkg.packageHeight) : undefined,
      }))

      // If no packages provided, create a single one from the top-level fields
      if (pkgs.length === 0) {
        pkgs.push({
          packageWeight: parseFloat(body.weight) || 0,
          packageTrackingNumber: trackingNumber,
          packageDescr: body.boxName || '',
          packageLength: body.length ? parseFloat(body.length) : undefined,
          packageWidth: body.width ? parseFloat(body.width) : undefined,
          packageHeight: body.height ? parseFloat(body.height) : undefined,
        })
      }

      const result = await updateItemFulfillment({
        internalId: String(internalId),
        trackingNumber,
        carrier,
        shippingMethod,
        shippingCost: shippingCost !== undefined && shippingCost !== '' ? parseFloat(shippingCost) : undefined,
        packages: pkgs,
        memo,
      })

      return NextResponse.json({
        success: result.status >= 200 && result.status < 300,
        status: result.status,
        data: result.data,
        raw: result.raw,
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error: any) {
    console.error('[NetSuite API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
