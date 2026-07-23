import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { defaultDesiredTools } from "../src/tool-state.mjs";
import { toolCatalogReport } from "../src/tools.mjs";
import { planSelfOperation } from "../src/self.mjs";

const schemaRoot = resolve(import.meta.dirname, "..", "spec", "schemas");

test("every published JSON schema parses and declares Draft 2020-12", () => {
  const files = readdirSync(schemaRoot)
    .filter((name) => name.endsWith(".schema.json"))
    .sort();
  assert.deepEqual(files, [
    "desired-tools.schema.json",
    "inspect-report.schema.json",
    "self-plan.schema.json",
    "self-receipt.schema.json",
    "tool-catalog.schema.json",
    "tool-plan.schema.json",
    "tool-receipt.schema.json",
    "tool-status.schema.json",
  ]);
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  for (const file of files) {
    const schema = JSON.parse(readFileSync(join(schemaRoot, file), "utf8"));
    assert.equal(
      schema.$schema,
      "https://json-schema.org/draft/2020-12/schema",
      file,
    );
    assert.ok(schema.title, file);
    assert.doesNotThrow(() => ajv.compile(schema), file);
  }
});

test("canonical documents agree with their published schema versions", () => {
  const desiredSchema = JSON.parse(
    readFileSync(join(schemaRoot, "desired-tools.schema.json"), "utf8"),
  );
  const catalogSchema = JSON.parse(
    readFileSync(join(schemaRoot, "tool-catalog.schema.json"), "utf8"),
  );
  const selfPlanSchema = JSON.parse(
    readFileSync(join(schemaRoot, "self-plan.schema.json"), "utf8"),
  );

  assert.equal(
    defaultDesiredTools().schemaVersion,
    desiredSchema.properties.schemaVersion.const,
  );
  assert.equal(
    toolCatalogReport().schemaVersion,
    catalogSchema.properties.schemaVersion.const,
  );

  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const validateDesired = ajv.compile(desiredSchema);
  const validateCatalog = ajv.compile(catalogSchema);
  const validateSelfPlan = ajv.compile(selfPlanSchema);
  assert.equal(validateDesired(defaultDesiredTools()), true, ajv.errorsText(validateDesired.errors));
  assert.equal(validateCatalog(toolCatalogReport()), true, ajv.errorsText(validateCatalog.errors));
  const selfPlan = planSelfOperation({
    operation: "update",
    home: "/tmp/agentctl-schema-home",
    env: {
      ...process.env,
      HOME: "/tmp/agentctl-schema-home",
    },
  });
  assert.equal(
    validateSelfPlan(selfPlan),
    true,
    ajv.errorsText(validateSelfPlan.errors),
  );
});
