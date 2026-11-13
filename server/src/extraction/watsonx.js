// watsonx.ai Runtime client: IAM token + text generation.
// Credentials stay server-side. Never import this file in frontend code.

const IAM_URL = "https://iam.cloud.ibm.com/identity/token";

let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;

  const apikey = process.env.WATSONX_API_KEY;
  if (!apikey) throw new Error("WATSONX_API_KEY is not set");

  const res = await fetch(IAM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "urn:ibm:params:oauth:grant-type:apikey",
      apikey,
    }),
  });
  if (!res.ok) throw new Error(`IAM token request failed: ${res.status}`);

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = data.expiration * 1000; // IAM returns seconds since epoch
  return cachedToken;
}

function buildPrompt(packetText) {
  return `Extract manufacturing requirements from the job packet below. Return only valid JSON with this shape:

{
  "sources": { "<field>": ["exact quote from packet"] },
  "requirements": {
    "process": string|null,
    "material": string|null,
    "order_quantity": number|null,
    "accepted_quantity": number|null,
    "tolerance_value": number|null,
    "tolerance_unit": "mm" | "in" | null,
    "due_at": string|null,
    "receiving_inspection_minutes": number|null,
    "cmm_report_required": boolean|null
  },
  "issues": [ { "field": "<field>", "reason": "missing" | "conflicting" } ]
}

Rules:
- Fill sources first. Each value in requirements must come from its quote in sources.
- process: short name only, e.g. "CNC milling".
- order_quantity: the build quantity exactly as written. Do NOT subtract anything.
- accepted_quantity: pieces already finished and accepted, exactly as written.
- Ignore spares, extra quantities, or notes that belong to other orders or suppliers.
- tolerance_value: search EVERY section, including emails, notes, and signed releases, for each ± tolerance on the critical feature. Only a ± value counts (±0.10 means 0.10). A plain dimension like "32.00 mm" is NOT a tolerance. If you find more than one and they differ, tolerance_value and tolerance_unit are null with a "conflicting" issue, and sources lists every quote. If none is found, they are null with a "missing" issue.
- due_at: ISO 8601 with timezone offset. Keep the packet's local time. ET in November is -05:00. Do not convert to UTC. If the packet gives more than one due date or deadline and they differ, due_at is null with a "conflicting" issue.
- cmm_report_required: search the whole packet for "CMM". "A CMM report is optional" means false. Not needed or not required also means false. Only true if a CMM report is required. If you quote a CMM line, the value cannot be null.
- Check every field across ALL sections. Any field with two different values is null with a "conflicting" issue, and sources lists both quotes.
- Every value in sources is an array of exact quotes copied from the packet. Quotes must be full sentences or lines from the packet.
- If a value is not stated anywhere, set it to null and add a "missing" issue.
- Do not do any arithmetic.
- issues only lists fields whose value is null.
- Output the JSON only. No explanation, analysis, or examples after it.

Job packet:
<packet>
${packetText.trim()}
</packet>

JSON output:
\`\`\`json
`;
}

async function generateExtraction(packetText) {
  const projectId = process.env.WATSONX_PROJECT_ID;
  if (!projectId) throw new Error("WATSONX_PROJECT_ID is not set");

  const modelId = process.env.WATSONX_MODEL_ID || "meta-llama/llama-3-3-70b-instruct";
  const watsonxUrl = (process.env.WATSONX_URL || "https://us-south.ml.cloud.ibm.com").replace(/\/$/, "");
  const token = await getToken();

  const res = await fetch(`${watsonxUrl}/ml/v1/text/generation?version=2023-05-29`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      input: buildPrompt(packetText),
      model_id: modelId,
      project_id: projectId,
      parameters: {
        decoding_method: "greedy",
        max_new_tokens: 900,
        min_new_tokens: 0,
        stop_sequences: ["```"],
        repetition_penalty: 1,
      },
      // No moderations block on purpose: PII masking can rewrite packet text
      // (places, dates), which would break the exact-quote check.
    }),
  });
  if (!res.ok) throw new Error(`watsonx generation failed: ${res.status}`);

  const data = await res.json();
  return data.results?.[0]?.generated_text ?? "";
}

module.exports = { buildPrompt, generateExtraction };
