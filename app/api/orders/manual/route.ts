import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { shipTo, box, weight, carrier } = body

    if (!shipTo?.name || !shipTo?.street1 || !shipTo?.city || !shipTo?.state || !shipTo?.postalCode) {
      return NextResponse.json({ error: 'Missing required address fields' }, { status: 400 })
    }

    // Generate sequential M-number
    const lastManual = await prisma.orderLog.findFirst({
      where: { orderNumber: { startsWith: 'M' } },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    })

    let nextNum = 1
    if (lastManual?.orderNumber) {
      const parsed = parseInt(lastManual.orderNumber.slice(1), 10)
      if (!isNaN(parsed)) nextNum = parsed + 1
    }
    const orderNumber = `M${String(nextNum).padStart(3, '0')}`

    const suggestedBox = box
      ? { boxId: box.boxId, boxName: box.boxName, lengthInches: box.lengthInches, widthInches: box.widthInches, heightInches: box.heightInches, weightLbs: box.weightLbs }
      : null

    const preShoppedRate = carrier
      ? { carrierId: carrier.carrierId, carrierCode: carrier.carrierCode, serviceCode: carrier.serviceCode, serviceName: carrier.serviceName, price: 0, deliveryDays: null, rateId: null }
      : null

    const rawPayload = {
      orderNumber,
      shipTo: {
        name: shipTo.name,
        company: shipTo.company || '',
        street1: shipTo.street1,
        street2: shipTo.street2 || '',
        city: shipTo.city,
        state: shipTo.state,
        postalCode: shipTo.postalCode,
        country: shipTo.country || 'US',
        phone: shipTo.phone || '',
      },
      items: [],
      orderTotal: 0,
      manual: true,
    }

    const order = await prisma.orderLog.create({
      data: {
        orderNumber,
        status: 'AWAITING_SHIPMENT',
        rawPayload: rawPayload as any,
        suggestedBox: suggestedBox as any,
        shippedWeight: weight ? parseFloat(weight) : null,
        preShoppedRate: preShoppedRate as any,
        orderType: 'SINGLE',
        addressValidated: false,
        addressOverridden: false,
      },
    })

    return NextResponse.json({ success: true, order })
  } catch (error: unknown) {
    console.error('Error creating manual order:', error)
    return NextResponse.json({ error: 'Failed to create manual order' }, { status: 500 })
  }
}
