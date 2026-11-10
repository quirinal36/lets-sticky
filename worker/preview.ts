const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;

export function firstUrl(body: string): string | null {
  const match = body.match(URL_PATTERN);
  if (!match) return null;
  const candidate = match[0].replace(/[.,!?)\]]+$/, "");
  try {
    return new URL(candidate).href.slice(0, 2000);
  } catch {
    return null;
  }
}

export interface LinkPreview {
  title: string | null;
  description: string | null;
  image: string | null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function clean(value: string | undefined, max: number): string | null {
  const out = decodeEntities(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return out || null;
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; StickyLinkPreview/1.0; +https://memo.letscoding.kr)",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "ko,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;

    const meta: Record<string, string> = {};
    let title = "";
    await new HTMLRewriter()
      .on("meta", {
        element(el) {
          const key = (el.getAttribute("property") ?? el.getAttribute("name") ?? "").toLowerCase();
          const content = el.getAttribute("content");
          if (key && content && !(key in meta)) meta[key] = content;
        },
      })
      .on("head > title", {
        text(chunk) {
          title += chunk.text;
        },
      })
      .transform(res)
      .arrayBuffer();

    let image: string | null = null;
    const rawImage = meta["og:image"] ?? meta["twitter:image"];
    if (rawImage) {
      try {
        const resolved = new URL(decodeEntities(rawImage), res.url || url);
        if (resolved.protocol === "https:") image = resolved.href.slice(0, 2000);
      } catch {
        // 이미지 주소가 잘못되어 있으면 이미지 없이 보여준다
      }
    }
    const preview = {
      title: clean(meta["og:title"] ?? meta["twitter:title"] ?? title, 200),
      description: clean(meta["og:description"] ?? meta["description"], 300),
      image,
    };
    return preview.title || preview.image ? preview : null;
  } catch {
    return null;
  }
}
