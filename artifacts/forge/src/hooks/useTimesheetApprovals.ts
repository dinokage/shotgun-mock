import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

// Server-backed timesheet sign-off (`timesheet_approvals`). The Payroll tab's
// approval used to live in component state, so it was gone on refresh and
// invisible to everyone but the person who clicked.
export interface TimesheetApprovalDTO {
  userId: string;
  date: string;
  approvedById: string;
  createdAt: string;
}

const KEY = ["timesheet-approvals"];

/** Today's approvals (studio time). `enabled` spares roles without the tab a request. */
export function useTimesheetApprovals(enabled = true) {
  return useQuery<{ date: string; approvals: TimesheetApprovalDTO[] }>({
    queryKey: KEY,
    queryFn: () => apiClient.get("/attendance/approvals"),
    enabled,
    staleTime: 30000,
  });
}

export function useApproveTimesheets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userIds: string[]) =>
      apiClient.post<{ date: string; approved: number }>("/attendance/approvals", {
        userIds,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
