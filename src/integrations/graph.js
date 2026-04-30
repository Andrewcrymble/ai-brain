import { ConfidentialClientApplication } from '@azure/msal-node';
import 'isomorphic-fetch';
import { Client } from '@microsoft/microsoft-graph-client';
import { config } from '../config.js';

const msal = new ConfidentialClientApplication({
  auth: {
    clientId: config.MS_CLIENT_ID,
    clientSecret: config.MS_CLIENT_SECRET,
    authority: `https://login.microsoftonline.com/${config.MS_TENANT_ID}`,
  },
});

let cachedToken = null;
let cachedExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedExpiry - now > 60_000) return cachedToken;
  const res = await msal.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  if (!res?.accessToken) throw new Error('Failed to acquire Microsoft Graph access token');
  cachedToken = res.accessToken;
  cachedExpiry = res.expiresOn
    ? new Date(res.expiresOn).getTime()
    : now + 50 * 60_000;
  return cachedToken;
}

export const graph = Client.initWithMiddleware({
  authProvider: { getAccessToken },
});

export const userPath = `/users/${encodeURIComponent(config.MS_USER_ID)}`;
