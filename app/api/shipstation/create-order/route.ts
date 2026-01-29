import { NextRequest, NextResponse } from 'next/server'

const SHIPSTATION_API_URL = 'https://ssapi.shipstation.com/orders/createorder'
const SHIPSTATION_API_KEY = process.env.SHIPSTATION_API_KEY || ''
const SHIPSTATION_API_SECRET = process.env.SHIPSTATION_API_SECRET || ''

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!SHIPSTATION_API_KEY || !SHIPSTATION_API_SECRET) {
      return NextResponse.json(
        {
          error: 'ShipStation API credentials not configured. Please set SHIPSTATION_API_KEY and SHIPSTATION_API_SECRET environment variables.',
        },
        { status: 500 }
      )
    }

    // Build Basic Auth credentials (API Key:Secret encoded in base64)
    const credentials = `${SHIPSTATION_API_KEY}:${SHIPSTATION_API_SECRET}`
    const encodedCredentials = Buffer.from(credentials).toString('base64')

    // Transform the request to ShipStation format
    const shipstationOrder = {
      orderNumber: body.orderNumber,
      orderKey: body.orderKey,
      orderDate: body.orderDate,
      paymentDate: body.paymentDate,
      shipByDate: body.shipByDate,
      orderStatus: body.orderStatus,
      customerEmail: body.customerEmail || '',
      billTo: {
        name: body.billTo.name,
        street1: body.billTo.street1,
        street2: body.billTo.street2 || '',
        city: body.billTo.city,
        state: body.billTo.state,
        postalCode: body.billTo.postalCode,
        country: body.billTo.country || 'US',
        phone: body.billTo.phone || '',
      },
      shipTo: {
        name: body.shipTo.name,
        street1: body.shipTo.street1,
        street2: body.shipTo.street2 || '',
        city: body.shipTo.city,
        state: body.shipTo.state,
        postalCode: body.shipTo.postalCode,
        country: body.shipTo.country || 'US',
        phone: body.shipTo.phone || '',
      },
      items: body.items.map((item: any, index: number) => ({
        lineItemKey: (index + 1).toString(),
        sku: item.sku,
        name: item.name,
        imageUrl: '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        warehouseLocation: '',
        options: [],
        productId: 0,
        fulfillmentSku: '',
      })),
      amountPaid: body.amountPaid || 0,
      taxAmount: body.taxAmount || 0,
      shippingAmount: body.shippingAmount || 0,
      customerNotes: body.customerNotes || '',
      internalNotes: body.internalNotes || '',
      gift: body.gift || false,
      giftMessage: '',
      paymentMethod: body.paymentMethod || 'Credit Card',
      requestedShippingService: body.requestedShippingService || 'usps_priority',
      carrierCode: '',
      serviceCode: '',
      packageCode: body.packageCode || 'package',
      confirmation: body.confirmation || 'delivery',
      shipDate: '',
      weight: {
        value: body.weight?.value || 0,
        units: body.weight?.units || 'pounds',
      },
      dimensions: {
        length: body.dimensions?.length || 0,
        width: body.dimensions?.width || 0,
        height: body.dimensions?.height || 0,
        units: body.dimensions?.units || 'inches',
      },
      insuranceOptions: {
        provider: '',
        insureShipment: false,
        insuredValue: 0,
      },
      internationalOptions: {
        contents: null,
        customsItems: null,
        nonDelivery: 'return_to_sender',
      },
      advancedOptions: {
        warehouseId: body.advancedOptions?.warehouseId || 0,
        storeId: body.advancedOptions?.storeId || 0,
        customField1: body.advancedOptions?.customField1 || '',
        customField2: '',
        customField3: '',
        source: body.advancedOptions?.source || 'test',
        billToParty: '',
        billToCountry: '',
        billToShopifyOrderId: '',
        billToShopifyOrderNumber: '',
      },
    }

    // Log the request for debugging
    console.log('ShipStation Request:', JSON.stringify(shipstationOrder, null, 2))

    // Make request to ShipStation
    const response = await fetch(SHIPSTATION_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${encodedCredentials}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(shipstationOrder),
    })

    const data = await response.json()
    
    // Log the response for debugging
    console.log('ShipStation Response Status:', response.status)
    console.log('ShipStation Response:', JSON.stringify(data, null, 2))

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data.message || data.errors?.[0]?.errorMessage || 'Failed to create order',
          request: shipstationOrder,
          response: data,
        },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('ShipStation API Error:', error)
    return NextResponse.json(
      {
        error: error.message || 'An error occurred while creating the order',
      },
      { status: 500 }
    )
  }
}

