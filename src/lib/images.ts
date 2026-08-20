import fs from "fs";
import path from "path";
import crypto from "crypto";

const IMAGES_DIR = path.join(process.cwd(), "data", "images");

export function ensureImagesDir() {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
}

export async function downloadAndStoreImage(
  imageUrl: string
): Promise<string | null> {
  try {
    ensureImagesDir();
    const hash = crypto.createHash("md5").update(imageUrl).digest("hex");
    const ext = getExtension(imageUrl);
    const filename = `${hash}${ext}`;
    const filepath = path.join(IMAGES_DIR, filename);

    if (fs.existsSync(filepath)) {
      return `/api/images/${filename}`;
    }

    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });

    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filepath, buffer);
    return `/api/images/${filename}`;
  } catch {
    return null;
  }
}

function getExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase().split("?")[0];
    if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif"].includes(ext)) {
      return ext;
    }
  } catch {}
  return ".jpg";
}

export async function processContentImages(
  html: string
): Promise<string> {
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  const replacements: [string, string][] = [];

  while ((match = imgRegex.exec(html)) !== null) {
    const originalUrl = match[1];
    if (originalUrl.startsWith("/api/images/") || originalUrl.startsWith("data:")) {
      continue;
    }
    const localPath = await downloadAndStoreImage(originalUrl);
    if (localPath) {
      replacements.push([originalUrl, localPath]);
    }
  }

  let processed = html;
  for (const [original, local] of replacements) {
    processed = processed.replaceAll(original, local);
  }
  return processed;
}
