/**
 * @NApiVersion 2.x
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 * @author Pirani
 * @scriptName ShipStation Order Creation - Scheduled Script
 */

define(['N/record', 'N/search', 'N/https', 'N/encode', 'N/runtime', 'N/format'], 
    function(record, search, https, encode, runtime, format) {
    
        function execute(context) {
            try {
                log.audit('Script Start', 'ShipStation Order Creation - Scheduled Script');
    
                var fulfillments = getEligibleItemFulfillments();
                log.audit('Search', 'Found ' + fulfillments.length + ' eligible Item Fulfillments');
    
                fulfillments.forEach(function(f) {
                    try {
                        processItemFulfillment(f.id, f.salesOrderId);
                    } catch (e) {
                        log.error('Processing Error', 'IF ' + f.id + ': ' + e.message);
                    }
                });
    
                log.audit('Script Complete', 'Processed ' + fulfillments.length + ' fulfillments.');
            } catch (e) {
                log.error('Fatal Script Error', e.message + ' | Stack: ' + e.stack);
            }
        }
    
        // ---------------------------------------------------------------------
        // 1️⃣ SEARCH FUNCTION
        // ---------------------------------------------------------------------
        function getEligibleItemFulfillments() {
            var results = [];
    
            var now = new Date();
            var yesterday = new Date();
            yesterday.setDate(now.getDate() - 1);
    
            var startDate = format.format({ value: yesterday, type: format.Type.DATE });
            var endDate   = format.format({ value: now, type: format.Type.DATE });
    
            log.debug('Search Range', 'Only orders created on ' + startDate);
    
            try {
                var searchObj = search.create({
                    type: 'itemfulfillment',
                    filters: [
                        ["type", "anyof", "ItemShip"],
                        "AND", ["mainline", "is", "T"],
                        "AND", ["status", "anyof", "ItemShip:A"],
                        "AND", ["custbody_pir_shipstation_ordid", "isempty", ""],
                        "AND", ["shipmethod", "noneof", ["9999", "1031", "1035"]],
                        "AND", ["datecreated", "within", startDate, endDate]
                    ],
                    columns: [
                        search.createColumn({ name: 'internalid' }),
                        search.createColumn({ name: 'createdfrom' })
                    ]
                });
    
                searchObj.run().each(function(r) {
                    results.push({
                        id: r.getValue({ name: 'internalid' }),
                        salesOrderId: r.getValue({ name: 'createdfrom' })
                    });
                    return true;
                });
    
                return results;
            } catch (e) {
                log.error('Search Failed', e.message + ' | ' + e.stack);
                return [];
            }
        }
    
        // ---------------------------------------------------------------------
        // 2️⃣ PROCESS EACH ITEM FULFILLMENT
        // ---------------------------------------------------------------------
        function processItemFulfillment(recId, soId) {
            log.audit('Processing IF', recId);
    
            var parentShipment = record.load({ type: record.Type.ITEM_FULFILLMENT, id: recId });
            var soRec = record.load({ type: record.Type.SALES_ORDER, id: soId });
    
            var shipMeth = parentShipment.getValue('shipmethod');
            var stat = parentShipment.getValue('shipstatus');
            var ssObj = parentShipment.getValue('custbody_pir_shipstation_ordid');
            var excluded = ['9999', '1031', '1035'];
    
            if (excluded.indexOf(shipMeth) !== -1) {
                log.audit('Skipped', 'IF ' + recId + ' uses excluded ship method');
                return;
            }
    
            if (stat !== 'A') {
                log.audit('Skipped', 'IF ' + recId + ' not in Approved (Picked) status');
                return;
            }
    
            if (ssObj) {
                log.audit('Skipped', 'IF ' + recId + ' already has ShipStation ID');
                return;
            }
    
            var response = sendOrdertoSS(parentShipment, soRec, recId);
    
            if (response && !response.hasErrors && response.results && response.results.length > 0) {
                var ssOrderId = response.results[0].orderId.toString();
                var ssHexId = '^#^' + response.results[0].orderId.toString(16) + '^';
    
                record.submitFields({
                    type: record.Type.ITEM_FULFILLMENT,
                    id: recId,
                    values: {
                        custbody_pir_ss_internal_id: ssOrderId,
                        custbody_pir_shipstation_ordid: ssHexId
                    }
                });
    
                log.audit('Success', 'Sent IF ' + recId + ' to ShipStation');
            } else {
                log.error('ShipStation Error', 'Failed to create order for IF ' + recId + 
                          ' | Response: ' + JSON.stringify(response));
            }
        }
    
        // ---------------------------------------------------------------------
        // 3️⃣ BUILD PAYLOAD AND SEND TO SHIPSTATION
        // ---------------------------------------------------------------------
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
                return JSON.parse(response.body);
    
            } catch (e) {
                log.error('sendOrdertoSS Error', e.message + ' | ' + e.stack);
                return { hasErrors: true, message: e.message };
            }
        }
    
        // ---------------------------------------------------------------------
        // 4️⃣ STATIC SHIP METHOD MAPPER
        // ---------------------------------------------------------------------
    function setShipMethod(parentShipment) {
        var shipMethodId = parentShipment.getValue('shipmethod');
    
        switch (shipMethodId) {
    
            case '4':
                return 'UPS® Ground';
    
            case '1556':
                return 'UPS 3 Day Select®';
    
            case '1238':
                return 'UPS 2nd Day Air®';
    
            default:
                // ShipStation expects a *service name*, not internal ID.
                // If unmapped, just return the plain text from NetSuite.
                return parentShipment.getText({ fieldId: 'shipmethod' });
        }
    }
    
    
        return { execute: execute };
    });
    