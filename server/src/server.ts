/**
 * server.ts
 *
 * Entry point.  Loads .env before importing cloudantClient so that the
 * env-var guard in cloudantClient.ts sees the values.
 */

import * as dotenv from "dotenv";
dotenv.config(); // loads server/.env (or cwd/.env when run from server/)

import { app } from "./app";

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`[server] Local Rescue Bid API listening on http://localhost:${port}`);
  console.log(`[server] POST http://localhost:${port}/api/match`);
});
