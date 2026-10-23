export function mediaMimeType(filename: string, video: boolean) {
  const extension = filename.toLowerCase().split(".").pop();
  if (video) {
    if (extension === "webm") return "video/webm";
    if (extension === "mov") return "video/quicktime";
    return "video/mp4";
  }
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic" || extension === "heif") return "image/heic";
  return "image/jpeg";
}
