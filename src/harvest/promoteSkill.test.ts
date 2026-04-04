import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { validateForPromotion, promoteSkill } from "./promoteSkill.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VALID_FRONTMATTER = `---
id: kafka-idempotent-consumer
type: skill
version: 0.1.0
source: harvested
confidence: medium
---`;

const VALID_BODY = `
# Description
Short explanation.

# Guidance
- Bullet guidance

# Examples
- Short example
`;

const VALID_CONTENT = `${VALID_FRONTMATTER}\n${VALID_BODY}`;

// ─── validateForPromotion ─────────────────────────────────────────────────────

describe("validateForPromotion", () => {
  it("returns valid for a well-formed candidate skill", () => {
    const result = validateForPromotion(VALID_CONTENT);
    assert.equal(result.valid, true);
    assert.equal(result.id, "kafka-idempotent-consumer");
  });

  it("returns invalid when frontmatter is missing", () => {
    const result = validateForPromotion("# Description\n# Guidance\n# Examples");
    assert.equal(result.valid, false);
    assert.match(result.error!, /missing YAML frontmatter/);
  });

  it("returns named error for missing 'id' field", () => {
    const content = `---
type: skill
version: 0.1.0
source: harvested
confidence: medium
---\n# Description\n# Guidance\n# Examples`;
    const result = validateForPromotion(content);
    assert.equal(result.valid, false);
    assert.match(result.error!, /missing required frontmatter field 'id'/);
  });

  it("returns named error for missing 'type' field", () => {
    const content = `---
id: test-skill
version: 0.1.0
source: harvested
confidence: medium
---\n# Description\n# Guidance\n# Examples`;
    const result = validateForPromotion(content);
    assert.equal(result.valid, false);
    assert.match(result.error!, /missing required frontmatter field 'type'/);
  });

  it("returns named error for missing 'version' field", () => {
    const content = `---
id: test-skill
type: skill
source: harvested
confidence: medium
---\n# Description\n# Guidance\n# Examples`;
    const result = validateForPromotion(content);
    assert.equal(result.valid, false);
    assert.match(result.error!, /missing required frontmatter field 'version'/);
  });

  it("returns named error for missing 'source' field", () => {
    const content = `---
id: test-skill
type: skill
version: 0.1.0
confidence: medium
---\n# Description\n# Guidance\n# Examples`;
    const result = validateForPromotion(content);
    assert.equal(result.valid, false);
    assert.match(result.error!, /missing required frontmatter field 'source'/);
  });

  it("returns named error for missing 'confidence' field", () => {
    const content = `---
id: test-skill
type: skill
version: 0.1.0
source: harvested
---\n# Description\n# Guidance\n# Examples`;
    const result = validateForPromotion(content);
    assert.equal(result.valid, false);
    assert.match(result.error!, /missing required frontmatter field 'confidence'/);
  });

  it("returns error for invalid confidence value", () => {
    const content = `---
id: test-skill
type: skill
version: 0.1.0
source: harvested
confidence: extreme
---\n# Description\n# Guidance\n# Examples`;
    const result = validateForPromotion(content);
    assert.equal(result.valid, false);
    assert.match(result.error!, /confidence.*must be one of/);
  });

  it("accepts all valid confidence values", () => {
    for (const confidence of ["low", "medium", "high"]) {
      const content = `---
id: test-skill
type: skill
version: 0.1.0
source: harvested
confidence: ${confidence}
---\n# Description\n# Guidance\n# Examples`;
      const result = validateForPromotion(content);
      assert.equal(result.valid, true, `expected valid for confidence=${confidence}`);
    }
  });

  it("returns error when # Description section is missing", () => {
    const content = `---
id: test-skill
type: skill
version: 0.1.0
source: harvested
confidence: medium
---\n# Guidance\n# Examples`;
    const result = validateForPromotion(content);
    assert.equal(result.valid, false);
    assert.match(result.error!, /missing required section '# Description'/);
  });

  it("returns error when # Guidance section is missing", () => {
    const content = `---
id: test-skill
type: skill
version: 0.1.0
source: harvested
confidence: medium
---\n# Description\n# Examples`;
    const result = validateForPromotion(content);
    assert.equal(result.valid, false);
    assert.match(result.error!, /missing required section '# Guidance'/);
  });

  it("returns error when # Examples section is missing", () => {
    const content = `---
id: test-skill
type: skill
version: 0.1.0
source: harvested
confidence: medium
---\n# Description\n# Guidance`;
    const result = validateForPromotion(content);
    assert.equal(result.valid, false);
    assert.match(result.error!, /missing required section '# Examples'/);
  });
});

// ─── promoteSkill ─────────────────────────────────────────────────────────────

describe("promoteSkill", () => {
  const ROOT = "/project";
  const SKILL_ID = "kafka-idempotent-consumer";
  const CANDIDATE_PATH = path.join(ROOT, "harvested", "candidate-skills", `${SKILL_ID}.md`);
  const DEST_PATH = path.join(ROOT, "skills", `${SKILL_ID}.md`);

  function makeFileExists(existingPaths: string[]): (p: string) => Promise<boolean> {
    return async (p) => existingPaths.includes(p);
  }

  function makeReadFile(files: Record<string, string>): (p: string) => Promise<string> {
    return async (p) => {
      if (p in files) return files[p];
      throw new Error(`File not found: ${p}`);
    };
  }

  function makeConfirmer(answer: boolean): (prompt: string) => Promise<boolean> {
    return async () => answer;
  }

  it("promotes a valid candidate skill to the skills directory", async () => {
    const printed: string[] = [];
    const copied: [string, string][] = [];
    const madeDirs: string[] = [];

    const result = await promoteSkill(
      { rootDir: ROOT, candidateSkillId: SKILL_ID },
      makeConfirmer(true),
      (line) => printed.push(line),
      makeFileExists([CANDIDATE_PATH]),
      makeReadFile({ [CANDIDATE_PATH]: VALID_CONTENT }),
      async (src, dest) => { copied.push([src, dest]); },
      async (dir) => { madeDirs.push(dir); },
    );

    assert.equal(result.promoted, true);
    assert.equal(result.aborted, false);
    assert.deepEqual(printed, [`Promoted: ${SKILL_ID}`]);
    assert.deepEqual(copied, [[CANDIDATE_PATH, DEST_PATH]]);
    assert.ok(madeDirs.includes(path.join(ROOT, "skills")));
  });

  it("returns error and prints when candidate skill file does not exist", async () => {
    const printed: string[] = [];

    const result = await promoteSkill(
      { rootDir: ROOT, candidateSkillId: SKILL_ID },
      makeConfirmer(true),
      (line) => printed.push(line),
      makeFileExists([]),
      makeReadFile({}),
      async () => {},
      async () => {},
    );

    assert.equal(result.promoted, false);
    assert.equal(result.aborted, false);
    assert.ok(result.error?.includes(SKILL_ID));
    assert.ok(printed[0].includes("not found"));
  });

  it("returns error when validation fails — missing # Guidance", async () => {
    const badContent = `---
id: ${SKILL_ID}
type: skill
version: 0.1.0
source: harvested
confidence: medium
---\n# Description\n# Examples`;

    const printed: string[] = [];

    const result = await promoteSkill(
      { rootDir: ROOT, candidateSkillId: SKILL_ID },
      makeConfirmer(true),
      (line) => printed.push(line),
      makeFileExists([CANDIDATE_PATH]),
      makeReadFile({ [CANDIDATE_PATH]: badContent }),
      async () => {},
      async () => {},
    );

    assert.equal(result.promoted, false);
    assert.equal(result.aborted, false);
    assert.match(result.error!, /missing required section '# Guidance'/);
    assert.ok(printed[0].startsWith("Error:"));
  });

  it("returns error when validation fails — invalid confidence", async () => {
    const badContent = `---
id: ${SKILL_ID}
type: skill
version: 0.1.0
source: harvested
confidence: extreme
---\n# Description\n# Guidance\n# Examples`;

    const printed: string[] = [];

    const result = await promoteSkill(
      { rootDir: ROOT, candidateSkillId: SKILL_ID },
      makeConfirmer(true),
      (line) => printed.push(line),
      makeFileExists([CANDIDATE_PATH]),
      makeReadFile({ [CANDIDATE_PATH]: badContent }),
      async () => {},
      async () => {},
    );

    assert.equal(result.promoted, false);
    assert.match(result.error!, /confidence.*must be one of/);
  });

  it("returns error when validation fails — missing required frontmatter field", async () => {
    const badContent = `---
type: skill
version: 0.1.0
source: harvested
confidence: medium
---\n# Description\n# Guidance\n# Examples`;

    const printed: string[] = [];

    const result = await promoteSkill(
      { rootDir: ROOT, candidateSkillId: SKILL_ID },
      makeConfirmer(true),
      (line) => printed.push(line),
      makeFileExists([CANDIDATE_PATH]),
      makeReadFile({ [CANDIDATE_PATH]: badContent }),
      async () => {},
      async () => {},
    );

    assert.equal(result.promoted, false);
    assert.match(result.error!, /missing required frontmatter field 'id'/);
  });

  it("prompts before overwriting when target already exists", async () => {
    const printed: string[] = [];
    const promptsReceived: string[] = [];
    const copied: [string, string][] = [];

    const result = await promoteSkill(
      { rootDir: ROOT, candidateSkillId: SKILL_ID },
      async (prompt) => { promptsReceived.push(prompt); return true; },
      (line) => printed.push(line),
      makeFileExists([CANDIDATE_PATH, DEST_PATH]),
      makeReadFile({ [CANDIDATE_PATH]: VALID_CONTENT }),
      async (src, dest) => { copied.push([src, dest]); },
      async () => {},
    );

    assert.equal(result.promoted, true);
    assert.equal(promptsReceived.length, 1);
    assert.match(promptsReceived[0], /already exists/);
    assert.deepEqual(printed, [`Promoted: ${SKILL_ID}`]);
  });

  it("aborts promotion when user declines overwrite", async () => {
    const printed: string[] = [];
    const copied: [string, string][] = [];

    const result = await promoteSkill(
      { rootDir: ROOT, candidateSkillId: SKILL_ID },
      makeConfirmer(false),
      (line) => printed.push(line),
      makeFileExists([CANDIDATE_PATH, DEST_PATH]),
      makeReadFile({ [CANDIDATE_PATH]: VALID_CONTENT }),
      async (src, dest) => { copied.push([src, dest]); },
      async () => {},
    );

    assert.equal(result.promoted, false);
    assert.equal(result.aborted, true);
    assert.equal(copied.length, 0);
    assert.deepEqual(printed, ["Promotion aborted. No files were changed."]);
  });

  it("does not prompt when target does not exist", async () => {
    const promptsReceived: string[] = [];
    const copied: [string, string][] = [];

    const result = await promoteSkill(
      { rootDir: ROOT, candidateSkillId: SKILL_ID },
      async (prompt) => { promptsReceived.push(prompt); return true; },
      () => {},
      makeFileExists([CANDIDATE_PATH]),
      makeReadFile({ [CANDIDATE_PATH]: VALID_CONTENT }),
      async (src, dest) => { copied.push([src, dest]); },
      async () => {},
    );

    assert.equal(result.promoted, true);
    assert.equal(promptsReceived.length, 0);
    assert.equal(copied.length, 1);
  });

  it("prints Promoted: <id> on success", async () => {
    const printed: string[] = [];

    await promoteSkill(
      { rootDir: ROOT, candidateSkillId: SKILL_ID },
      makeConfirmer(true),
      (line) => printed.push(line),
      makeFileExists([CANDIDATE_PATH]),
      makeReadFile({ [CANDIDATE_PATH]: VALID_CONTENT }),
      async () => {},
      async () => {},
    );

    assert.deepEqual(printed, [`Promoted: ${SKILL_ID}`]);
  });
});
