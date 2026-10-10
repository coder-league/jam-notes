import { randomBytes } from 'node:crypto';

const key = () => randomBytes(18).toString('base64url');

console.log('Paste these into your environment variables:\n');
console.log(`KEY_OM=${key()}`);
console.log(`KEY_GISELE=${key()}`);
console.log('\nYour link:     https://<your-site>/?k=<KEY_OM>');
console.log("Gisele's link: https://<your-site>/?k=<KEY_GISELE>");
