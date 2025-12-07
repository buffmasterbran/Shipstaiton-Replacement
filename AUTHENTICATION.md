# Authentication Guide

The API supports **HTTP Basic Authentication** (same format as ShipStation) for seamless integration with your existing NetSuite scripts.

## Authentication Methods

### Method 1: Basic Authentication (Recommended)

This is the **same method ShipStation uses**, making it easy to integrate with your existing NetSuite code.

**Format:**
```
Authorization: Basic <base64(apiKey:apiSecret)>
```

**Example:**
```javascript
// NetSuite
var creds = apiKey + ':' + apiSecret;
var encodedCreds = encode.convert({
    string: creds,
    inputEncoding: encode.Encoding.UTF_8,
    outputEncoding: encode.Encoding.BASE_64
});

headers: {
    'Authorization': 'Basic ' + encodedCreds
}
```

**cURL Example:**
```bash
# Encode credentials
CREDS=$(echo -n "your-api-key:your-api-secret" | base64)

curl -X POST https://your-project.vercel.app/api/ingest-batch \
  -H "Authorization: Basic $CREDS" \
  -H "Content-Type: application/json" \
  -d '{"order_number": "12345"}'
```

### Method 2: x-api-secret Header (Backward Compatibility)

For simpler integrations, you can use a custom header:

**Format:**
```
x-api-secret: <your-api-secret>
```

**Example:**
```javascript
headers: {
    'x-api-secret': 'your-api-secret'
}
```

**cURL Example:**
```bash
curl -X POST https://your-project.vercel.app/api/ingest-batch \
  -H "x-api-secret: your-api-secret" \
  -H "Content-Type: application/json" \
  -d '{"order_number": "12345"}'
```

## Environment Variables

Set these in Vercel:

- **API_KEY**: Your API key (can be any string, e.g., "netsuite")
- **API_SECRET**: Your secure secret (generate with `npm run generate:secret`)

For Basic Auth, both are required. For x-api-secret header, only API_SECRET is needed.

## NetSuite Integration

See [NETSUITE_INTEGRATION.md](./NETSUITE_INTEGRATION.md) for complete NetSuite script examples using Basic Auth.

## Testing

Use the included test script:

```bash
# Basic Auth (recommended)
npm run test:api https://your-project.vercel.app your-api-key your-api-secret

# x-api-secret header
npm run test:api https://your-project.vercel.app your-api-secret --header
```

