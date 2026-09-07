import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";

export interface UploadedFileDTO {
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

// apiFetch already skips setting a JSON Content-Type when the body is a
// FormData instance (see lib/apiClient.ts) so the browser can set the
// multipart boundary itself -- no special handling needed here.
export function useUploadFile() {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiFetch<UploadedFileDTO>("/uploads", {
        method: "POST",
        body: formData,
      });
    },
  });
}

// Separate endpoint from useUploadFile: /uploads/video stores under its own
// directory and is served back with a real video/* Content-Type (no forced
// download), which is what lets the Review Player's <video> element play it
// back at all -- see routes/uploads.ts's videoUpload for why this can't
// reuse the generic attachment upload.
export function useUploadVideo() {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiFetch<UploadedFileDTO>("/uploads/video", {
        method: "POST",
        body: formData,
      });
    },
  });
}
