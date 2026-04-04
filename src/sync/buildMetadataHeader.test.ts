import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildMetadataHeader } from "./buildMetadataHeader";

describe("buildMetadataHeader", () => {
  test("includes all five required fields", () => {
    const header = buildMetadataHeader({
      rootDir: "/spec-forge",
      assetId: "spring-boot-resilience",
      assetType: "skills",
      syncedAt: "2026-04-03T10:15:00Z",
      project: "comm-service",
    });

    assert.ok(header.includes("source:"), "missing source field");
    assert.ok(header.includes("assetId:"), "missing assetId field");
    assert.ok(header.includes("assetType:"), "missing assetType field");
    assert.ok(header.includes("syncedAt:"), "missing syncedAt field");
    assert.ok(header.includes("project:"), "missing project field");
  });

  test("source field uses spec-forge path with asset type and id", () => {
    const header = buildMetadataHeader({
      rootDir: "/spec-forge",
      assetId: "spring-boot-resilience",
      assetType: "skills",
      syncedAt: "2026-04-03T10:15:00Z",
      project: "comm-service",
    });

    assert.ok(header.includes("source: spec-forge/skills/spring-boot-resilience.md"));
  });

  test("assetId has correct value", () => {
    const header = buildMetadataHeader({
      rootDir: "/spec-forge",
      assetId: "spring-boot-resilience",
      assetType: "skills",
      syncedAt: "2026-04-03T10:15:00Z",
      project: "comm-service",
    });

    assert.ok(header.includes("assetId: spring-boot-resilience"));
  });

  test("assetType uses singular form for skills", () => {
    const header = buildMetadataHeader({
      rootDir: "/spec-forge",
      assetId: "kafka-patterns",
      assetType: "skills",
      syncedAt: "2026-01-01T00:00:00Z",
      project: "my-project",
    });

    assert.ok(header.includes("assetType: skill"));
  });

  test("assetType uses singular form for instructions", () => {
    const header = buildMetadataHeader({
      rootDir: "/spec-forge",
      assetId: "backend-baseline",
      assetType: "instructions",
      syncedAt: "2026-01-01T00:00:00Z",
      project: "my-project",
    });

    assert.ok(header.includes("assetType: instruction"));
  });

  test("assetType uses knowledge (unchanged) for knowledge", () => {
    const header = buildMetadataHeader({
      rootDir: "/spec-forge",
      assetId: "event-driven",
      assetType: "knowledge",
      syncedAt: "2026-01-01T00:00:00Z",
      project: "my-project",
    });

    assert.ok(header.includes("assetType: knowledge"));
  });

  test("syncedAt has correct ISO timestamp", () => {
    const syncedAt = "2026-04-03T10:15:00Z";
    const header = buildMetadataHeader({
      rootDir: "/spec-forge",
      assetId: "test",
      assetType: "skills",
      syncedAt,
      project: "proj",
    });

    assert.ok(header.includes(`syncedAt: ${syncedAt}`));
  });

  test("project field has correct value", () => {
    const header = buildMetadataHeader({
      rootDir: "/spec-forge",
      assetId: "test",
      assetType: "skills",
      syncedAt: "2026-01-01T00:00:00Z",
      project: "comm-service",
    });

    assert.ok(header.includes("project: comm-service"));
  });

  test("header is wrapped in HTML comment tags", () => {
    const header = buildMetadataHeader({
      rootDir: "/spec-forge",
      assetId: "test",
      assetType: "skills",
      syncedAt: "2026-01-01T00:00:00Z",
      project: "proj",
    });

    assert.ok(header.startsWith("<!-- SPEC-FORGE-SYNC"));
    assert.ok(header.endsWith("-->"));
  });

  test("matches exact format from spec-v1.md §11.2", () => {
    const header = buildMetadataHeader({
      rootDir: "/spec-forge",
      assetId: "spring-boot-resilience",
      assetType: "skills",
      syncedAt: "2026-04-03T10:15:00Z",
      project: "comm-service",
    });

    const expected = [
      "<!-- SPEC-FORGE-SYNC",
      "source: spec-forge/skills/spring-boot-resilience.md",
      "assetId: spring-boot-resilience",
      "assetType: skill",
      "syncedAt: 2026-04-03T10:15:00Z",
      "project: comm-service",
      "-->",
    ].join("\n");

    assert.equal(header, expected);
  });
});
