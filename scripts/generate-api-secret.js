#!/usr/bin/env node

/**
 * Generate a secure API secret for use in environment variables
 * Usage: node scripts/generate-api-secret.js
 */

const crypto = require('crypto');

// Generate a 32-byte random string and encode as base64
const secret = crypto.randomBytes(32).toString('base64');

console.log('\nGenerated API Secret:');
console.log('='.repeat(60));
console.log(secret);
console.log('='.repeat(60));
console.log('\nAdd this to your .env file:');
console.log(`API_SECRET="${secret}"`);
console.log('\nAdd this to Vercel Environment Variables:');
console.log(`API_SECRET = ${secret}`);
console.log('');
