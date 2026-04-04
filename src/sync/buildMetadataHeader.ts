export type AssetType = "skills" | "instructions" | "knowledge";

export interface MetadataHeaderInput {
  rootDir: string;
  assetId: string;
  assetType: AssetType;
  syncedAt: string;
  project: string;
}

/**
 * Builds the metadata header prepended to every synced file.
 *
 * Format (spec-v1.md §11.2):
 * <!-- SPEC-FORGE-SYNC
 * source: spec-forge/<type>/<id>.md
 * assetId: <id>
 * assetType: <singular type>
 * syncedAt: <ISO timestamp>
 * project: <project name>
 * -->
 */
export function buildMetadataHeader(input: MetadataHeaderInput): string {
  const singularType = assetTypeToSingular(input.assetType);
  const source = `spec-forge/${input.assetType}/${input.assetId}.md`;

  return [
    "<!-- SPEC-FORGE-SYNC",
    `source: ${source}`,
    `assetId: ${input.assetId}`,
    `assetType: ${singularType}`,
    `syncedAt: ${input.syncedAt}`,
    `project: ${input.project}`,
    "-->",
  ].join("\n");
}

function assetTypeToSingular(assetType: AssetType): string {
  // "skills" → "skill", "instructions" → "instruction", "knowledge" → "knowledge"
  if (assetType === "skills") return "skill";
  if (assetType === "instructions") return "instruction";
  return "knowledge";
}
