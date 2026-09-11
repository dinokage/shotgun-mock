import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiFetch } from "@/lib/apiClient";

export type AssetActivityKind = "dcc_open" | "publish";

/**
 * One entry in an asset's append-only attribution log: who hit "Open in DCC"
 * or "Publish", when, and (for a DCC launch) which application. The Asset's
 * own `publishStatus` is a separate, shared field written through
 * useUpdateAsset — this log only carries the who/when trace, which isn't part
 * of the Asset schema.
 */
export interface AssetActivityDTO {
  id: string;
  assetId: string;
  kind: AssetActivityKind;
  app: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: string;
}

// Rows come back newest-first, so the first match is the latest one.
export function latestActivity(
  rows: AssetActivityDTO[],
  kind: AssetActivityKind,
): AssetActivityDTO | undefined {
  return rows.find((row) => row.kind === kind);
}

export function useAssetActivity(assetId: string | undefined) {
  return useQuery<AssetActivityDTO[]>({
    queryKey: ["asset-activity", assetId],
    queryFn: () =>
      apiFetch<AssetActivityDTO[]>(
        `/asset-activity?assetId=${encodeURIComponent(assetId!)}`,
      ),
    enabled: !!assetId,
    staleTime: 10000,
  });
}

export function useRecordAssetActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { assetId: string; kind: AssetActivityKind; app?: string }) =>
      apiClient.post<AssetActivityDTO>("/asset-activity", body),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({
        queryKey: ["asset-activity", variables.assetId],
      }),
  });
}
