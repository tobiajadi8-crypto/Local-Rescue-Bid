/**
 * cloudantClient.ts
 *
 * Reads CLOUDANT_URL, CLOUDANT_APIKEY, and CLOUDANT_DB from the environment
 * (populated by dotenv in server.ts before this module is first imported) and
 * exports a ready-to-use CloudantV1 client plus the target database name.
 *
 * Throws at startup if any required variable is missing, so misconfiguration
 * fails fast rather than silently at request time.
 */

import { CloudantV1, IamAuthenticator } from "@ibm-cloud/cloudant";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy server/.env.example to server/.env and fill in the real values.`
    );
  }
  return value;
}

const cloudantUrl = requireEnv("CLOUDANT_URL");
const cloudantApiKey = requireEnv("CLOUDANT_APIKEY");

export const cloudantDb = requireEnv("CLOUDANT_DB");

export const cloudant = new CloudantV1({
  authenticator: new IamAuthenticator({ apikey: cloudantApiKey }),
  serviceUrl: cloudantUrl,
});
