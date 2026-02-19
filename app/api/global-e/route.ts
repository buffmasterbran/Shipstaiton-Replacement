/**
 * Global-E Shipping API route
 *
 * NOT TESTED -- Built from API documentation only (Feb 2026).
 * Will need debugging when the first real international order comes through.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getShippingDocuments,
  dispatchOrders,
  voidParcel,
  extractLabels,
  extractCommercialInvoices,
  buildParcelsFromItems,
  type GetShippingDocumentsResponse,
} from '@/lib/global-e'
import { submitPrintJob, submitPrintJobBase64 } from '@/lib/printnode'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const action = body.action as string

    switch (action) {
      // ==================================================================
      // GET LABEL: Fetch shipping documents from Global-E and optionally print
      // ==================================================================
      case 'get-label': {
        const { orderLogId, printerId } = body as {
          orderLogId: string
          printerId?: number
        }

        if (!orderLogId) {
          return NextResponse.json({ error: 'orderLogId is required' }, { status: 400 })
        }

        const orderLog = await prisma.orderLog.findUnique({
          where: { id: orderLogId },
        })

        if (!orderLog) {
          return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        }

        const payload = orderLog.rawPayload as any
        const orderData = Array.isArray(payload) ? payload[0] : payload
        const items = orderData?.items || []
        const orderNumber = orderLog.orderNumber

        const parcels = buildParcelsFromItems(orderNumber, items)

        if (parcels[0].Products.length === 0) {
          return NextResponse.json({ error: 'No shippable items found in order' }, { status: 400 })
        }

        console.log(`[Global-E] Getting shipping documents for order ${orderNumber}`)

        let response: GetShippingDocumentsResponse
        try {
          response = await getShippingDocuments({
            OrderId: orderNumber,
            Parcels: parcels,
          })
        } catch (err: any) {
          console.error(`[Global-E] API call failed for ${orderNumber}:`, err.message)
          return NextResponse.json({ error: `Global-E API error: ${err.message}` }, { status: 502 })
        }

        if (!response.IsSuccess) {
          const errorDetail = response.ErrorText || response.Errors?.[0]?.ErrorText || 'Unknown error'
          const errorCode = response.Errors?.[0]?.ErrorCode || 'UNKNOWN'
          console.error(`[Global-E] Error ${errorCode} for ${orderNumber}: ${errorDetail}`)
          return NextResponse.json({
            error: `Global-E error (${errorCode}): ${errorDetail}`,
          }, { status: 400 })
        }

        const labels = extractLabels(response)
        const invoices = extractCommercialInvoices(response)
        const tracking = response.ParcelsTracking?.[0]
        const trackingDetails = response.TrackingDetails

        const trackingNumber = tracking?.ParcelTrackingNumber || trackingDetails?.TrackingNumber || null
        const trackingUrl = tracking?.ParcelTrackingUrl || trackingDetails?.TrackingURL || null
        const carrierName = trackingDetails?.ShipperName || 'Global-E'

        // Save tracking info to the order
        await prisma.orderLog.update({
          where: { id: orderLogId },
          data: {
            trackingNumber,
            carrier: carrierName,
            status: 'SHIPPED',
            shippedAt: new Date(),
          },
        })

        console.log(`[Global-E] Order ${orderNumber} → tracking: ${trackingNumber}, carrier: ${carrierName}`)
        console.log(`[Global-E] Got ${labels.length} label(s), ${invoices.length} invoice(s)`)

        // Print label if printer specified
        const printResults: Array<{ type: string; jobId: number }> = []

        if (printerId && labels.length > 0) {
          for (const label of labels) {
            try {
              let jobId: number
              if (label.URL) {
                jobId = await submitPrintJob(printerId, `Global-E Label - ${orderNumber}`, label.URL)
              } else if (label.DocumentData) {
                jobId = await submitPrintJobBase64(printerId, `Global-E Label - ${orderNumber}`, label.DocumentData)
              } else {
                console.warn(`[Global-E] Label has no URL or DocumentData`)
                continue
              }
              printResults.push({ type: 'label', jobId })
            } catch (err: any) {
              console.error(`[Global-E] Failed to print label:`, err.message)
            }
          }
        }

        // Print commercial invoices if any (to same printer for now)
        if (printerId && invoices.length > 0) {
          for (const invoice of invoices) {
            try {
              let jobId: number
              if (invoice.URL) {
                jobId = await submitPrintJob(printerId, `Global-E Invoice - ${orderNumber}`, invoice.URL)
              } else if (invoice.DocumentData) {
                jobId = await submitPrintJobBase64(printerId, `Global-E Invoice - ${orderNumber}`, invoice.DocumentData)
              } else {
                continue
              }
              printResults.push({ type: 'commercial_invoice', jobId })
            } catch (err: any) {
              console.error(`[Global-E] Failed to print invoice:`, err.message)
            }
          }
        }

        return NextResponse.json({
          success: true,
          trackingNumber,
          trackingUrl,
          carrier: carrierName,
          labelCount: labels.length,
          invoiceCount: invoices.length,
          labelUrls: labels.map(l => l.URL).filter(Boolean),
          invoiceUrls: invoices.map(i => i.URL).filter(Boolean),
          printResults,
          parcelCode: parcels[0].ParcelCode,
        })
      }

      // ==================================================================
      // DISPATCH: Notify Global-E orders have been physically dispatched
      // ==================================================================
      case 'dispatch': {
        const { orderNumbers } = body as { orderNumbers: string[] }

        if (!orderNumbers?.length) {
          return NextResponse.json({ error: 'orderNumbers array is required' }, { status: 400 })
        }

        console.log(`[Global-E] Dispatching ${orderNumbers.length} order(s)`)

        try {
          const response = await dispatchOrders({ OrderIds: orderNumbers })

          if (!response.IsSuccess) {
            return NextResponse.json({
              error: `Global-E dispatch error: ${response.ErrorText || 'Unknown'}`,
            }, { status: 400 })
          }

          const manifestUrls = response.ShipperManifests?.map(m => m.URL).filter(Boolean) || []

          return NextResponse.json({
            success: true,
            manifestCount: response.ShipperManifests?.length || 0,
            manifestUrls,
          })
        } catch (err: any) {
          return NextResponse.json({ error: `Global-E dispatch failed: ${err.message}` }, { status: 502 })
        }
      }

      // ==================================================================
      // VOID: Cancel a parcel/label that was generated but not shipped
      // ==================================================================
      case 'void': {
        const { orderNumber, parcelCode } = body as {
          orderNumber: string
          parcelCode: string
        }

        if (!orderNumber || !parcelCode) {
          return NextResponse.json({ error: 'orderNumber and parcelCode are required' }, { status: 400 })
        }

        console.log(`[Global-E] Voiding parcel ${parcelCode} for order ${orderNumber}`)

        try {
          const response = await voidParcel({
            OrderId: orderNumber,
            ParcelCode: parcelCode,
          })

          if (!response.IsSuccess) {
            const errMsg = response.Errors?.[0]?.ErrorText || 'Unknown error'
            return NextResponse.json({ error: `Global-E void error: ${errMsg}` }, { status: 400 })
          }

          return NextResponse.json({ success: true })
        } catch (err: any) {
          return NextResponse.json({ error: `Global-E void failed: ${err.message}` }, { status: 502 })
        }
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error('[Global-E] Route error:', error)
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 })
  }
}
