// Turns raw model output into the shared API shape and checks it against the packet.
// Pure functions, no network: easy to unit test.
const { z } = require("zod");

const MM_PER_INCH = 25.4;
const OUTPUT_FIELDS = [
  "process",
  "material",
  "remaining_quantity",
  "tolerance_half_width_mm",
  "due_at",
  "receiving_inspection_minutes",
  "cmm_report_required",
];

// Swap this for the shared Zod schema once agreed with Tobi.
const ExtractResponseSchema = z.object({
  requirements: z.object({
    process: z.string().nullable(),
    material: z.string().nullable(),
    remaining_quantity: z.number().int().nonnegative().nullable(),
    tolerance_half_width_mm: z.number().positive().nullable(),
    due_at: z.string().nullable(),
    receiving_inspection_minutes: z.number().int().nonnegative().nullable(),
    cmm_report_required: z.boolean().nullable(),
  }),
  sources: z.record(z.string(), z.array(z.string())),
  issues: z.array(
    z.object({ field: z.string(), reason: z.enum(["missing", "conflicting"]) })
  ),
});

// ---------- parsing ----------

// Pull the first complete {...} object out of the model text, ignoring fences or chatter.
function parseModelJson(text) {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("No JSON object in model output");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("Model output JSON is incomplete (raise max tokens?)");
}

// ---------- helpers ----------

const squash = (s) => s.replace(/\s+/g, " ").trim();

function validQuotes(quotes, packet) {
  const p = squash(packet);
  return (Array.isArray(quotes) ? quotes : [])
    .filter((q) => typeof q === "string" && q.trim())
    .filter((q) => p.includes(squash(q)));
}

function numbersIn(text) {
  return (text.match(/\d+(?:\.\d+)?/g) || []).map(Number);
}

// The value must literally appear as a number inside one of its quotes.
function numberBackedByQuote(value, quotes) {
  return typeof value === "number" && quotes.some((q) => numbersIn(q).includes(value));
}

// Every "±0.05 mm" / "±0.002 in" in the packet, converted to mm, with its line.
function findPlusMinusTolerances(packet) {
  const out = [];
  const re = /±\s*(\d+(?:\.\d+)?)\s*(mm|in\b|inch(?:es)?|")/gi;
  for (const line of packet.split("\n")) {
    for (const m of line.matchAll(re)) {
      const isInch = m[2].toLowerCase() !== "mm";
      const mm = round(Number(m[1]) * (isInch ? MM_PER_INCH : 1));
      out.push({ mm, line: line.trim() });
    }
  }
  return out;
}

const round = (n) => Math.round(n * 1e6) / 1e6;

// Offset for America/Toronto (ET) at a given instant, e.g. "-05:00".
function torontoOffset(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const name = parts.find((p) => p.type === "timeZoneName")?.value || "GMT-05:00";
  return name === "GMT" ? "+00:00" : name.replace("GMT", "");
}

// Normalize to YYYY-MM-DDTHH:MM:SS±HH:MM in ET.
function normalizeDueAt(value) {
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})$/);
  if (!m) return null;
  const [, date, hh, mm, ss = "00", zone] = m;
  if (zone !== "Z") return `${date}T${hh}:${mm}:${ss}${zone}`;

  // Model converted to UTC anyway: convert back to ET wall time.
  const instant = new Date(value);
  const offset = torontoOffset(instant);
  const sign = offset.startsWith("-") ? -1 : 1;
  const [oh, om] = offset.slice(1).split(":").map(Number);
  const local = new Date(instant.getTime() + sign * (oh * 60 + om) * 60_000);
  return local.toISOString().slice(0, 19) + offset;
}

function cmmFromQuotes(quotes) {
  const text = quotes.join(" ").toLowerCase();
  if (!text.includes("cmm")) return undefined;
  if (/optional|not required|not needed|no cmm/.test(text)) return false;
  if (/required|must|mandatory/.test(text)) return true;
  return undefined;
}

// ---------- main ----------

function normalizeExtraction(raw, packetText) {
  const req = raw?.requirements ?? {};
  const rawSources = raw?.sources ?? {};
  const rawIssues = Array.isArray(raw?.issues) ? raw.issues : [];

  const src = (field) => validQuotes(rawSources[field], packetText);
  const issueFor = (field) => rawIssues.find((i) => i?.field === field)?.reason;

  const requirements = {};
  const sources = {};
  const issues = new Map(); // field -> reason

  const setIssue = (field, reason) => {
    if (reason === "conflicting" || !issues.has(field)) issues.set(field, reason);
  };

  // process / material: strings that must be backed by a real quote
  for (const field of ["process", "material"]) {
    const quotes = src(field);
    const value = typeof req[field] === "string" ? req[field].trim() : null;
    if (value && quotes.length) {
      requirements[field] = value;
      sources[field] = quotes;
    } else {
      requirements[field] = null;
      if (quotes.length) sources[field] = quotes;
      setIssue(field, issueFor(field) === "conflicting" ? "conflicting" : "missing");
    }
  }

  // remaining_quantity = order - accepted (done here, not by the model)
  {
    const oq = src("order_quantity");
    const aq = src("accepted_quantity");
    const order = numberBackedByQuote(req.order_quantity, oq) ? req.order_quantity : null;
    const accepted = numberBackedByQuote(req.accepted_quantity, aq) ? req.accepted_quantity : null;
    const quotes = [...new Set([...oq, ...aq])];
    if (quotes.length) sources.remaining_quantity = quotes;

    const conflicting =
      issueFor("order_quantity") === "conflicting" || issueFor("accepted_quantity") === "conflicting";
    if (order !== null && accepted !== null && order - accepted >= 0 && !conflicting) {
      requirements.remaining_quantity = order - accepted;
    } else {
      requirements.remaining_quantity = null;
      setIssue("remaining_quantity", conflicting ? "conflicting" : "missing");
    }
  }

  // tolerance: model answer, cross-checked against every ± in the packet
  {
    const found = findPlusMinusTolerances(packetText);
    const distinct = [...new Set(found.map((f) => f.mm))];
    const modelReason = issueFor("tolerance_value") || issueFor("tolerance_unit");
    const tq = [...new Set([...src("tolerance_value"), ...src("tolerance_unit")])];

    let value = null;
    if (typeof req.tolerance_value === "number" && (req.tolerance_unit === "mm" || req.tolerance_unit === "in")) {
      value = round(req.tolerance_value * (req.tolerance_unit === "in" ? MM_PER_INCH : 1));
    }

    if (distinct.length === 0) {
      requirements.tolerance_half_width_mm = null;
      setIssue("tolerance_half_width_mm", "missing");
    } else if (distinct.length > 1 || modelReason === "conflicting") {
      requirements.tolerance_half_width_mm = null;
      sources.tolerance_half_width_mm = [...new Set(found.map((f) => f.line))];
      setIssue("tolerance_half_width_mm", "conflicting");
    } else {
      // exactly one ± value in the packet: trust it over the model
      requirements.tolerance_half_width_mm = value === distinct[0] ? value : distinct[0];
      sources.tolerance_half_width_mm = tq.length ? tq : [found[0].line];
    }
  }

  // due_at
  {
    const quotes = src("due_at");
    const value = normalizeDueAt(req.due_at);
    if (quotes.length) sources.due_at = quotes;
    if (value && quotes.length && issueFor("due_at") !== "conflicting") {
      requirements.due_at = value;
    } else {
      requirements.due_at = null;
      setIssue("due_at", issueFor("due_at") === "conflicting" ? "conflicting" : "missing");
    }
  }

  // receiving_inspection_minutes
  {
    const quotes = src("receiving_inspection_minutes");
    const value = req.receiving_inspection_minutes;
    if (quotes.length) sources.receiving_inspection_minutes = quotes;
    if (numberBackedByQuote(value, quotes) && Number.isInteger(value)) {
      requirements.receiving_inspection_minutes = value;
    } else {
      requirements.receiving_inspection_minutes = null;
      setIssue(
        "receiving_inspection_minutes",
        issueFor("receiving_inspection_minutes") === "conflicting" ? "conflicting" : "missing"
      );
    }
  }

  // cmm_report_required: decided from the quote wording when the model wavers
  {
    let quotes = src("cmm_report_required");
    if (!quotes.length) {
      quotes = packetText.split(/(?<=\.)\s+|\n/).map((s) => s.trim()).filter((s) => /\bCMM\b/i.test(s));
    }
    const fromQuote = cmmFromQuotes(quotes);
    const value = typeof req.cmm_report_required === "boolean" ? req.cmm_report_required : null;
    const finalValue = fromQuote !== undefined ? fromQuote : value;
    if (quotes.length) sources.cmm_report_required = quotes;
    if (finalValue !== null && issueFor("cmm_report_required") !== "conflicting") {
      requirements.cmm_report_required = finalValue;
    } else {
      requirements.cmm_report_required = null;
      setIssue(
        "cmm_report_required",
        issueFor("cmm_report_required") === "conflicting" ? "conflicting" : "missing"
      );
    }
  }

  // Only null fields keep an issue; every null field has one.
  for (const f of OUTPUT_FIELDS) {
    if (requirements[f] !== null) issues.delete(f);
    else if (!issues.has(f)) issues.set(f, "missing");
  }

  const result = {
    requirements: Object.fromEntries(OUTPUT_FIELDS.map((f) => [f, requirements[f]])),
    sources,
    issues: OUTPUT_FIELDS.filter((f) => issues.has(f)).map((f) => ({ field: f, reason: issues.get(f) })),
  };
  return ExtractResponseSchema.parse(result);
}

module.exports = { ExtractResponseSchema, parseModelJson, findPlusMinusTolerances, normalizeDueAt, normalizeExtraction };
