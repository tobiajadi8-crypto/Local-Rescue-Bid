// Run: node --test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseModelJson, normalizeExtraction, normalizeDueAt } = require("./normalize.js");

const J01 = `# J01 · Actuator mounting bracket
Synthetic job packet · originating shop in Detroit, Michigan · Revision B

## 1. Work order and dispatch handoff
CNC mill out of service. Open a rush request for a Michigan supplier.
Build quantity: 240 pieces. Finished and accepted before breakdown: 60. Outsource only the unfinished balance.
Email from dispatch: receiving has to sign off by 12:00 ET Friday, November 20, 2026. Allow 30 minutes for incoming inspection after the courier arrives.
A CMM report is optional. Receiving will perform the standard incoming inspection.

## 2. Drawing excerpt · Revision B
Part: Actuator mounting bracket
Material: 6061-T6 aluminum
Operation: CNC milling, including the critical hole pattern.
Critical hole center spacing: 32.00 ±0.05 mm. All other dimensions have wider tolerances.`;

const J04 = `# J04 · Motor spacer plate
Synthetic job packet · originating shop in Detroit, Michigan · Revision B

## 1. Work order and dispatch handoff
CNC mill out of service. Open a rush request for a Michigan supplier.
Build quantity: 100 pieces. Finished and accepted before breakdown: 50. Outsource only the unfinished balance.
Email from dispatch: receiving has to sign off by 12:00 ET Friday, November 20, 2026. Allow 30 minutes for incoming inspection after the courier arrives.
A CMM report is optional. Receiving will perform the standard incoming inspection.

## 2. Drawing excerpt · Revision B
Part: Motor spacer plate
Material: 6061-T6 aluminum
Operation: CNC milling, including the critical hole pattern.
Critical hole center spacing: 32.00 mm. Tolerance per missing customer specification attachment Q-17. No general tolerance is stated.`;

const J08 = `# J08 · Drive cover bracket
Synthetic job packet · originating shop in Detroit, Michigan · Revision B

## 1. Work order and dispatch handoff
CNC mill out of service. Open a rush request for a Michigan supplier.
Build quantity: 160 pieces. Finished and accepted before breakdown: 60. Outsource only the unfinished balance.
Email from dispatch: receiving has to sign off by 12:00 ET Friday, November 20, 2026. Allow 30 minutes for incoming inspection after the courier arrives.
A CMM report is optional. Receiving will perform the standard incoming inspection. The signed release also lists hole center spacing at 32.00 ±0.10 mm for Revision B.

## 2. Drawing excerpt · Revision B
Part: Drive cover bracket
Material: 6061-T6 aluminum
Operation: CNC milling, including the critical hole pattern.
Critical hole center spacing: 32.00 ±0.05 mm. All other dimensions have wider tolerances.`;

const common = {
  process: ["Operation: CNC milling, including the critical hole pattern."],
  material: ["Material: 6061-T6 aluminum"],
  due_at: ["Email from dispatch: receiving has to sign off by 12:00 ET Friday, November 20, 2026."],
  receiving_inspection_minutes: ["Allow 30 minutes for incoming inspection after the courier arrives."],
  cmm_report_required: ["A CMM report is optional."],
};

// The bad J01 run: model subtracted (180), CMM null, no seconds, junk after JSON.
const badJ01Text =
  "```json\n" +
  JSON.stringify({
    sources: {
      ...common,
      order_quantity: ["Build quantity: 240 pieces. Finished and accepted before breakdown: 60. Outsource only the unfinished balance."],
      accepted_quantity: ["Finished and accepted before breakdown: 60."],
      tolerance_value: ["Critical hole center spacing: 32.00 ±0.05 mm."],
    },
    requirements: {
      process: "CNC milling", material: "6061-T6 aluminum",
      order_quantity: 180, accepted_quantity: 60,
      tolerance_value: 0.05, tolerance_unit: "mm",
      due_at: "2026-11-20T12:00-05:00",
      receiving_inspection_minutes: 30, cmm_report_required: null,
    },
    issues: [{ field: "cmm_report_required", reason: "missing" }],
  }) +
  "\n```\n# Step-by-step analysis of the problem:\n1. blah { not json";

test("J01 bad model run still becomes the expected answer... except quantity", () => {
  const out = normalizeExtraction(parseModelJson(badJ01Text), J01);
  // 180 is not in a quote that contains 180, so quantity is rejected, not silently wrong
  assert.equal(out.requirements.remaining_quantity, null);
  assert.deepEqual(out.issues, [{ field: "remaining_quantity", reason: "missing" }]);
  assert.equal(out.requirements.cmm_report_required, false);
  assert.equal(out.requirements.due_at, "2026-11-20T12:00:00-05:00");
  assert.equal(out.requirements.tolerance_half_width_mm, 0.05);
});

test("J01 good run matches the demo values", () => {
  const raw = {
    sources: {
      ...common,
      order_quantity: ["Build quantity: 240 pieces."],
      accepted_quantity: ["Finished and accepted before breakdown: 60."],
      tolerance_value: ["Critical hole center spacing: 32.00 ±0.05 mm."],
      tolerance_unit: ["mm"],
    },
    requirements: {
      process: "CNC milling", material: "6061-T6 aluminum",
      order_quantity: 240, accepted_quantity: 60,
      tolerance_value: 0.05, tolerance_unit: "mm",
      due_at: "2026-11-20T17:00:00Z", // UTC slip gets converted back
      receiving_inspection_minutes: 30, cmm_report_required: false,
    },
    issues: [],
  };
  const out = normalizeExtraction(raw, J01);
  assert.deepEqual(out.requirements, {
    process: "CNC milling",
    material: "6061-T6 aluminum",
    remaining_quantity: 180,
    tolerance_half_width_mm: 0.05,
    due_at: "2026-11-20T12:00:00-05:00",
    receiving_inspection_minutes: 30,
    cmm_report_required: false,
  });
  assert.deepEqual(out.issues, []);
  assert.ok(out.sources.remaining_quantity.length === 2);
});

test("J04 bad run (model invented 0.05) is forced to missing", () => {
  const raw = {
    sources: {
      ...common,
      order_quantity: ["Build quantity: 100 pieces."],
      accepted_quantity: ["Finished and accepted before breakdown: 50."],
      tolerance_value: ["32.00 mm."],
      tolerance_unit: ["mm"],
    },
    requirements: {
      process: "CNC milling", material: "6061-T6 aluminum",
      order_quantity: 100, accepted_quantity: 50,
      tolerance_value: 0.05, tolerance_unit: "mm",
      due_at: "2026-11-20T12:00-05:00",
      receiving_inspection_minutes: 30, cmm_report_required: null,
    },
    issues: [{ field: "cmm_report_required", reason: "missing" }],
  };
  const out = normalizeExtraction(raw, J04);
  assert.equal(out.requirements.tolerance_half_width_mm, null);
  assert.equal(out.requirements.remaining_quantity, 50);
  assert.equal(out.requirements.cmm_report_required, false);
  assert.deepEqual(out.issues, [{ field: "tolerance_half_width_mm", reason: "missing" }]);
});

test("J08 bad run (model missed the conflict) is forced to conflicting", () => {
  const raw = {
    sources: {
      ...common,
      order_quantity: ["Build quantity: 160 pieces."],
      accepted_quantity: ["Finished and accepted before breakdown: 60."],
      tolerance_value: ["32.00 ±0.05 mm"],
    },
    requirements: {
      process: "CNC milling", material: "6061-T6 aluminum",
      order_quantity: 160, accepted_quantity: 60,
      tolerance_value: 0.05, tolerance_unit: "mm",
      due_at: "2026-11-20T12:00:00-05:00",
      receiving_inspection_minutes: 30, cmm_report_required: false,
    },
    issues: [{ field: "cmm_report_required", reason: "missing" }],
  };
  const out = normalizeExtraction(raw, J08);
  assert.equal(out.requirements.tolerance_half_width_mm, null);
  assert.equal(out.requirements.remaining_quantity, 100);
  assert.deepEqual(out.issues, [{ field: "tolerance_half_width_mm", reason: "conflicting" }]);
  assert.equal(out.sources.tolerance_half_width_mm.length, 2);
});

test("quotes not in the packet are dropped", () => {
  const raw = {
    sources: { ...common, material: ["Material: 7075 aluminum"] },
    requirements: { material: "7075 aluminum" },
    issues: [],
  };
  const out = normalizeExtraction(raw, J01);
  assert.equal(out.requirements.material, null);
  assert.ok(out.issues.some((i) => i.field === "material" && i.reason === "missing"));
});

test("inch tolerance converts to mm", () => {
  const packet = J01.replace("±0.05 mm", '±0.002 in');
  const raw = {
    sources: { tolerance_value: ['Critical hole center spacing: 32.00 ±0.002 in.'] },
    requirements: { tolerance_value: 0.002, tolerance_unit: "in" },
    issues: [],
  };
  const out = normalizeExtraction(raw, packet);
  assert.equal(out.requirements.tolerance_half_width_mm, 0.0508);
});

test("due_at formats", () => {
  assert.equal(normalizeDueAt("2026-11-20T12:00-05:00"), "2026-11-20T12:00:00-05:00");
  assert.equal(normalizeDueAt("2026-11-20T17:00:00Z"), "2026-11-20T12:00:00-05:00");
  assert.equal(normalizeDueAt("Nov 20"), null);
});
