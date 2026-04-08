import fs from "node:fs/promises";
import path from "node:path";

function resolveMimeFromPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

async function fileToDataUrl(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const mime = resolveMimeFromPath(filePath);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function fetchToDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

export async function resolveLogoSource(options: {
  logoUrl?: string | null;
  logoFilename?: string | null;
}) {
  if (options.logoUrl) {
    const remote = await fetchToDataUrl(options.logoUrl);
    if (remote) return remote;
  }

  if (options.logoFilename) {
    const safeName = path.basename(options.logoFilename);
    const filePath = path.join(process.cwd(), "public", safeName);
    try {
      return await fileToDataUrl(filePath);
    } catch {
      // ignore
    }
  }

  const fallbackPath = path.join(process.cwd(), "public", "logo.jpg");
  try {
    return await fileToDataUrl(fallbackPath);
  } catch {
    return null;
  }
}
