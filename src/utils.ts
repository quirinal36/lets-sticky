export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`;
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "방금";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  const date = new Date(timestamp);
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function extension(name: string): string {
  const match = name.match(/\.([A-Za-z0-9]{1,5})$/);
  return match ? match[1].toUpperCase() : "FILE";
}

export const isImage = (type: string) => /^image\/(png|jpeg|gif|webp|avif)$/.test(type);
export const isVideo = (type: string) => /^video\/(mp4|webm|quicktime)$/.test(type);
export const isAudio = (type: string) => type.startsWith("audio/");

export const fileUrl = (id: string) => `/f/${id}`;
export const downloadUrl = (id: string) => `/f/${id}?dl`;
