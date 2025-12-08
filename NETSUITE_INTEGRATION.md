# NetSuite Integration Guide

This guide shows how to integrate your NetSuite script with the new shipping log API endpoint using the same Basic Authentication method as ShipStation.

## Authentication Method

The API supports **HTTP Basic Authentication** (same as ShipStation):
- Combine your API key and secret: `apiKey:apiSecret`
- Base64 encode the credentials
- Send as: `Authorization: Basic <base64-encoded-credentials>`

## Environment Variables

In Vercel, you'll need to set:
- `API_KEY` - Your API key (can be any string you choose)
- `API_SECRET` - Your API secret (generate with `npm run generate:secret`)

## NetSuite Script Example

Here's how to modify your existing `sendOrdertoSS` function to also send to your new endpoint:

```javascript
function sendOrdertoSS(parentShipment, soRec, recId) {
    try {
        // ... existing ShipStation code ...
        
        // After sending to ShipStation, also send to your endpoint
        sendOrderToCustomEndpoint(parentShipment, soRec, recId, body);
        
        return JSON.parse(response.body);
    } catch (e) {
        log.error('sendOrdertoSS Error', e.message + ' | ' + e.stack);
        return { hasErrors: true, message: e.message };
    }
}

function sendOrderToCustomEndpoint(parentShipment, soRec, recId, orderPayload) {
    try {
        // Get credentials from your custom record
        var credRec = record.load({ type: 'customrecord_pir_cred_vault', id: 1 });
        
        // Use the same API key/secret pattern, or create new ones
        var apiKey = credRec.getValue('custrecord_pir_api_key'); // Or create new field
        var apiSecret = credRec.getValue('custrecord_pir_secret_key'); // Or create new field
        
        // Build Basic Auth credentials (same as ShipStation)
        var creds = apiKey + ':' + apiSecret;
        var encodedCreds = encode.convert({
            string: creds,
            inputEncoding: encode.Encoding.UTF_8,
            outputEncoding: encode.Encoding.BASE_64
        });
        
        // Your Vercel endpoint URL
        var url = 'https://your-project.vercel.app/api/ingest-batch';
        
        // Send the same payload (or modify as needed)
        var payloadString = JSON.stringify(orderPayload, null, 2);
        
        log.audit('Custom Endpoint Payload', payloadString);
        
        var response = https.post({
            url: url,
            body: payloadString,
            headers: {
                'Authorization': 'Basic ' + encodedCreds,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        log.debug('Custom Endpoint Response', response.code + ' | ' + response.body);
        
        return JSON.parse(response.body);
        
    } catch (e) {
        // Log error but don't fail the main function
        log.error('Custom Endpoint Error', e.message + ' | ' + e.stack);
        return { hasErrors: true, message: e.message };
    }
}
```

## Complete Modified Function

Here's your complete function modified to send to both ShipStation and your custom endpoint:

```javascript
function sendOrdertoSS(parentShipment, soRec, recId) {
    try {
        var credRec = record.load({ type: 'customrecord_pir_cred_vault', id: 1 });
        var apKey = credRec.getValue('custrecord_pir_api_key');
        var apSec = credRec.getValue('custrecord_pir_secret_key');
        var creds = apKey + ':' + apSec;
        var encodedCreds = encode.convert({
            string: creds,
            inputEncoding: encode.Encoding.UTF_8,
            outputEncoding: encode.Encoding.BASE_64
        });

        var storeId = 257680;
        var url = 'https://ssapi.shipstation.com/orders/createorders';
        var tranDate = soRec.getValue('custbody_pir_shop_order_date') || parentShipment.getValue('trandate');
        var isoDate = new Date(tranDate).toISOString();
        var orderNumber = (soRec.getValue('custbody_sales_channel') === '1')
            ? soRec.getValue('otherrefnum')
            : parentShipment.getValue('sonum');
        var memo = soRec.getValue('memo');

        // ---- Build Items ----
        var items = [];
        var pckWeight = [];
        var lineCount = parentShipment.getLineCount({ sublistId: 'item' });

        for (var i = 0; i < lineCount; i++) {
            var skuId = parentShipment.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
            if (['99998', '99999'].indexOf(skuId) !== -1) continue;

            var weight = soRec.getSublistValue({ sublistId: 'item', fieldId: 'weightinlb', line: i }) || 0;
            var rate = soRec.getSublistValue({ sublistId: 'item', fieldId: 'rate', line: i }) || '0.00';
            pckWeight.push(Number(weight));

            items.push({
                lineItemKey: (i + 1),
                sku: parentShipment.getSublistValue({ sublistId: 'item', fieldId: 'itemname', line: i }),
                name: parentShipment.getSublistValue({ sublistId: 'item', fieldId: 'itemdescription', line: i }),
                weight: { value: Number(weight), units: 'pounds' },
                quantity: parentShipment.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i }),
                unitPrice: rate
            });
        }

        var totPckWeight = pckWeight.reduce(function(a, b) { return a + b; }, 0).toFixed(2);

        // ---- Guaranteed Shipping Address ----
        var shipAddrSub = parentShipment.getSubrecord({ fieldId: 'shippingaddress' });
        var shipTo = {
            name: shipAddrSub.getValue('addressee') || soRec.getValue('shipaddressee') || 'Unknown Recipient',
            company: shipAddrSub.getValue('attention') || soRec.getValue('shipcompany') || '',
            street1: shipAddrSub.getValue('addr1') || '',
            street2: shipAddrSub.getValue('addr2') || '',
            city: shipAddrSub.getValue('city') || '',
            state: shipAddrSub.getValue('state') || '',
            postalCode: shipAddrSub.getValue('zip') || '',
            country: shipAddrSub.getValue('country') || 'US',
            phone: shipAddrSub.getValue('phone') || '',
            residential: true
        };

        var billAddrSub = soRec.getSubrecord({ fieldId: 'billingaddress' });
        var billTo = {
            name: billAddrSub.getValue('addressee') || '',
            street1: billAddrSub.getValue('addr1') || '',
            street2: billAddrSub.getValue('addr2') || '',
            city: billAddrSub.getValue('city') || '',
            state: billAddrSub.getValue('state') || '',
            postalCode: billAddrSub.getValue('zip') || '',
            country: billAddrSub.getValue('country') || '',
            phone: billAddrSub.getValue('phone') || ''
        };

        // ---- Build Payload ----
        var body = [{
            orderNumber: orderNumber,
            orderKey: recId,
            orderDate: isoDate,
            paymentDate: isoDate,
            shipByDate: isoDate,
            orderStatus: 'awaiting_shipment',
            billTo: billTo,
            shipTo: shipTo,
            items: items,
            amountPaid: soRec.getValue('total') || 0,
            taxAmount: 0,
            shippingAmount: parentShipment.getValue('shippingcost') || 0,
            customerNotes: '',
            internalNotes: '',
            gift: false,
            paymentMethod: 'Credit Card',
            requestedShippingService: setShipMethod(parentShipment),
            packageCode: 'package',
            confirmation: 'delivery',
            weight: { value: Number(totPckWeight), units: 'pounds' },
            dimensions: { units: 'inches', length: 7, width: 7, height: 2 },
            advancedOptions: {
                warehouseId: 870629,
                storeId: storeId,
                customField1: memo || '',
                source: 'netsuite'
            }
        }];

        var payloadString = JSON.stringify(body, null, 2);
        log.audit('ShipStation Payload', payloadString);

        // Send to ShipStation
        var response = https.post({
            url: url,
            body: payloadString,
            headers: {
                'Authorization': 'Basic ' + encodedCreds,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        log.debug('ShipStation Response', response.code + ' | ' + response.body);

        // ALSO send to your custom endpoint
        sendOrderToCustomEndpoint(parentShipment, soRec, recId, body, apKey, apSec);

        return JSON.parse(response.body);

    } catch (e) {
        log.error('sendOrdertoSS Error', e.message + ' | ' + e.stack);
        return { hasErrors: true, message: e.message };
    }
}

function sendOrderToCustomEndpoint(parentShipment, soRec, recId, orderPayload, apiKey, apiSecret) {
    try {
        // Build Basic Auth credentials (same format as ShipStation)
        var creds = apiKey + ':' + apiSecret;
        var encodedCreds = encode.convert({
            string: creds,
            inputEncoding: encode.Encoding.UTF_8,
            outputEncoding: encode.Encoding.BASE_64
        });

        // Your Vercel endpoint URL - UPDATE THIS WITH YOUR ACTUAL URL
        var customUrl = 'https://your-project.vercel.app/api/ingest-batch';

        var payloadString = JSON.stringify(orderPayload, null, 2);
        log.audit('Custom Endpoint Payload', payloadString);

        var response = https.post({
            url: customUrl,
            body: payloadString,
            headers: {
                'Authorization': 'Basic ' + encodedCreds,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        log.debug('Custom Endpoint Response', response.code + ' | ' + response.body);
        return JSON.parse(response.body);

    } catch (e) {
        // Log error but don't fail the main ShipStation function
        log.error('Custom Endpoint Error', e.message + ' | ' + e.stack);
        return { hasErrors: true, message: e.message };
    }
}
```

## Setup Steps

1. **Get your API credentials**:
   - Generate API secret: `npm run generate:secret`
   - Choose an API key (can be any string, e.g., "netsuite" or "shipstation-replacement")

2. **Set environment variables in Vercel**:
   - `API_KEY` = Your chosen API key
   - `API_SECRET` = Generated secret

3. **Update NetSuite script**:
   - Add the `sendOrderToCustomEndpoint` function
   - Call it from `sendOrdertoSS` after ShipStation call
   - Update the `customUrl` variable with your Vercel URL

4. **Test**:
   - Create a test shipment in NetSuite
   - Check your dashboard at `https://your-project.vercel.app`
   - Verify the order appears in the logs

## Using Different Credentials

If you want to use **different** credentials for your endpoint (recommended for security):

1. Add new fields to your `customrecord_pir_cred_vault`:
   - `custrecord_custom_api_key`
   - `custrecord_custom_api_secret`

2. Update the function:
   ```javascript
   var customApiKey = credRec.getValue('custrecord_custom_api_key');
   var customApiSecret = credRec.getValue('custrecord_custom_api_secret');
   sendOrderToCustomEndpoint(parentShipment, soRec, recId, body, customApiKey, customApiSecret);
   ```

3. Set these values in Vercel as `API_KEY` and `API_SECRET`



