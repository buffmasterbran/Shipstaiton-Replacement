#!/usr/bin/env node

/**
 * Test the ingest-batch API endpoint
 * Usage: 
 *   Basic Auth: node scripts/test-api.js [url] [api-key] [api-secret]
 *   Header Auth: node scripts/test-api.js [url] [api-secret] --header
 * Example: 
 *   node scripts/test-api.js http://localhost:3000 mykey mysecret
 *   node scripts/test-api.js http://localhost:3000 mysecret --header
 */

const https = require('https');
const http = require('http');

const url = process.argv[2] || 'http://localhost:3000';
const apiKey = process.argv[3] || process.env.API_KEY || '';
const apiSecret = process.argv[4] || process.env.API_SECRET || '';
const useHeader = process.argv.includes('--header');

let authHeader;

if (useHeader) {
  // Use x-api-secret header (backward compatibility)
  if (!apiSecret) {
    console.error('❌ Error: API_SECRET not provided');
    console.log('\nUsage:');
    console.log('  node scripts/test-api.js [url] [api-secret] --header');
    process.exit(1);
  }
  authHeader = { 'x-api-secret': apiSecret };
} else {
  // Use Basic Auth (ShipStation style)
  if (!apiKey || !apiSecret) {
    console.error('❌ Error: API_KEY and API_SECRET not provided');
    console.log('\nUsage:');
    console.log('  Basic Auth: node scripts/test-api.js [url] [api-key] [api-secret]');
    console.log('  Header Auth: node scripts/test-api.js [url] [api-secret] --header');
    console.log('\nOr set API_KEY and API_SECRET environment variables');
    process.exit(1);
  }
  // Build Basic Auth header (same as ShipStation)
  const credentials = `${apiKey}:${apiSecret}`;
  const encodedCreds = Buffer.from(credentials).toString('base64');
  authHeader = { 'Authorization': `Basic ${encodedCreds}` };
}

const endpoint = `${url}/api/ingest-batch`;
const isHttps = endpoint.startsWith('https://');
const client = isHttps ? https : http;

// Test payload - single order
const testOrder = {
  order_number: `TEST-${Date.now()}`,
  customer: 'Test Customer',
  email: 'test@example.com',
  items: [
    { sku: 'ABC123', quantity: 2, price: 29.99 },
    { sku: 'XYZ789', quantity: 1, price: 49.99 },
  ],
  shipping_address: {
    street: '123 Test St',
    city: 'Test City',
    state: 'TS',
    zip: '12345',
  },
};

const payload = JSON.stringify(testOrder);
const urlObj = new URL(endpoint);

const options = {
  hostname: urlObj.hostname,
  port: urlObj.port || (isHttps ? 443 : 80),
  path: urlObj.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...authHeader,
    'Content-Length': Buffer.byteLength(payload),
  },
};

console.log(`\n🚀 Testing API endpoint: ${endpoint}`);
console.log(`🔐 Auth method: ${useHeader ? 'x-api-secret header' : 'Basic Auth (ShipStation style)'}`);
console.log(`📦 Sending test order: ${testOrder.order_number}\n`);

const req = client.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`📊 Status Code: ${res.statusCode}`);
    console.log(`📋 Response Headers:`, res.headers);
    console.log(`\n📄 Response Body:`);
    
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
      
      if (res.statusCode === 200 && json.success) {
        console.log('\n✅ Success! Order ingested successfully.');
      } else {
        console.log('\n❌ Error: Request failed');
      }
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error(`\n❌ Error: ${error.message}`);
  if (error.code === 'ECONNREFUSED') {
    console.log('\n💡 Make sure your development server is running:');
    console.log('   npm run dev');
  }
});

req.write(payload);
req.end();

