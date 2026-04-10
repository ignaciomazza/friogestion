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

function resolvePublicAssetPath(value: string) {
  const normalized = value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/^public\//i, "");
  if (!normalized) return null;

  const publicDir = path.resolve(process.cwd(), "public");
  const candidate = path.resolve(publicDir, normalized);
  const relative = path.relative(publicDir, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;

  return candidate;
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
    const filePath = resolvePublicAssetPath(options.logoFilename);
    if (filePath) {
      try {
        return await fileToDataUrl(filePath);
      } catch {
        // ignore
      }
    }
  }

  for (const fallbackName of ["logo.png", "logo.jpg"]) {
    const fallbackPath = path.join(process.cwd(), "public", fallbackName);
    try {
      return await fileToDataUrl(fallbackPath);
    } catch {
      // ignore
    }
  }

  return null;
}
