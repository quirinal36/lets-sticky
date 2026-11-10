import type { FileInfo } from "../shared/types";

const CLIENT_KEY = "sticky.clientId";

function createClientId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

// 로그인 없이 "내 게시물"과 "내 응답"을 구분하기 위한 브라우저별 식별자
export const clientId: string = (() => {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = createClientId();
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return createClientId();
  }
})();

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      "x-client-id": clientId,
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? "요청을 처리하지 못했습니다.", res.status);
  return data as T;
}

export function uploadFile(file: File, onProgress: (ratio: number) => void): { promise: Promise<FileInfo>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<FileInfo>((resolve, reject) => {
    xhr.open("PUT", "/api/files");
    xhr.setRequestHeader("x-client-id", clientId);
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText) as { file?: FileInfo; error?: string };
        if (xhr.status < 300 && data.file) resolve(data.file);
        else reject(new Error(data.error ?? "업로드에 실패했습니다."));
      } catch {
        reject(new Error("업로드에 실패했습니다."));
      }
    };
    xhr.onerror = () => reject(new Error("업로드에 실패했습니다."));
    xhr.onabort = () => reject(new Error("취소됨"));
    xhr.send(file);
  });
  return { promise, abort: () => xhr.abort() };
}
