import { confirmService } from "../utils/confirm";

export interface ConfirmSyncInput {
  hasPendingChanges: boolean;
}

export interface ConfirmSyncResult {
  confirmed: boolean;
  prompted: boolean;
}

/**
 * Handles the single sync confirmation prompt.
 * - Only prompts when there is at least one CREATE/UPDATE item.
 * - Uses a single global prompt: Apply changes? (y/n)
 * - On rejection, prints the required abort message.
 */
export async function confirmSync(
  input: ConfirmSyncInput,
  confirmer: Pick<typeof confirmService, "confirmYesNo"> = confirmService,
  print: (line: string) => void = console.log,
): Promise<ConfirmSyncResult> {
  if (!input.hasPendingChanges) {
    return { confirmed: true, prompted: false };
  }

  const confirmed = await confirmer.confirmYesNo("Apply changes? (y/n)");

  if (!confirmed) {
    print("Sync aborted. No files were changed.");
    return { confirmed: false, prompted: true };
  }

  return { confirmed: true, prompted: true };
}
