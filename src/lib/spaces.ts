import {
  createHash,
  createHmac,
  randomUUID,
  type BinaryLike,
} from "node:crypto";
import { StorefrontDomainError } from "@/lib/storefront/service";
import type { StorefrontProductImage } from "@/lib/storefront/types";

const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;
const PUBLIC_CACHE_CONTROL = "public, max-age=31536000, immutable";

const imageExtensionsByType = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/gif", "gif"],
]);

type SpacesConfig = {
  region: string;
  bucket: string;
  endpoint: string;
  cdnUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
};

type SignedRequestInput = {
  method: "DELETE" | "PUT";
  url: URL;
  body?: Buffer;
  contentType?: string;
  config: SpacesConfig;
};

const getEnv = (name: string) => process.env[name]?.trim() ?? "";

function getSpacesConfig(): SpacesConfig {
  const config = {
    region: getEnv("DO_SPACES_REGION"),
    bucket: getEnv("DO_SPACES_BUCKET"),
    endpoint: getEnv("DO_SPACES_ENDPOINT"),
    cdnUrl: getEnv("DO_SPACES_CDN_URL"),
    accessKeyId: getEnv("DO_SPACES_ACCESS_KEY_ID"),
    secretAccessKey: getEnv("DO_SPACES_SECRET_ACCESS_KEY"),
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new StorefrontDomainError("Storage de imagenes no configurado.", 500);
  }

  return {
    ...config,
    endpoint: config.endpoint.replace(/\/+$/, ""),
    cdnUrl: config.cdnUrl.replace(/\/+$/, ""),
  };
}

const hmac = (key: BinaryLike, value: string) =>
  createHmac("sha256", key).update(value).digest();

const hashHex = (value: BinaryLike | string) =>
  createHash("sha256").update(value).digest("hex");

const toAmzDate = (date: Date) =>
  date.toISOString().replace(/[:-]|\.\d{3}/g, "");

const encodeObjectKey = (key: string) =>
  key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

function getObjectUrl(config: SpacesConfig, key: string) {
  const endpoint = new URL(config.endpoint);
  const host = endpoint.host.startsWith(`${config.bucket}.`)
    ? endpoint.host
    : `${config.bucket}.${endpoint.host}`;
  return new URL(`${endpoint.protocol}//${host}/${encodeObjectKey(key)}`);
}

function getPublicUrl(config: SpacesConfig, key: string) {
  return `${config.cdnUrl}/${encodeObjectKey(key)}`;
}

function signSpacesRequest(input: SignedRequestInput) {
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = hashHex(input.body ?? "");
  const headers: Record<string, string> = {
    host: input.url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (input.method === "PUT") {
    headers["cache-control"] = PUBLIC_CACHE_CONTROL;
    headers["content-type"] = input.contentType ?? "application/octet-stream";
    headers["x-amz-acl"] = "public-read";
  }
  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders
    .map((key) => `${key}:${headers[key]}`)
    .join("\n");
  const canonicalRequest = [
    input.method,
    input.url.pathname,
    "",
    `${canonicalHeaders}\n`,
    signedHeaders.join(";"),
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${input.config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join("\n");
  const dateKey = hmac(`AWS4${input.config.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, input.config.region);
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders.join(
      ";",
    )}, Signature=${signature}`,
  };
}

const buildImageKeyPrefix = (input: {
  organizationId: string;
  productId: string;
}) =>
  [
    "organizations",
    input.organizationId,
    "storefront",
    "publications",
    input.productId,
  ].join("/");

function buildImageKey(input: {
  organizationId: string;
  productId: string;
  extension: string;
}) {
  return [
    buildImageKeyPrefix(input),
    `${Date.now()}-${randomUUID()}.${input.extension}`,
  ].join("/");
}

export async function uploadStorefrontPublicationImage(input: {
  organizationId: string;
  productId: string;
  file: File;
  alt: string;
}): Promise<StorefrontProductImage> {
  const extension = imageExtensionsByType.get(input.file.type);
  if (!extension) {
    throw new StorefrontDomainError("Formato de imagen no soportado.", 400);
  }
  if (input.file.size <= 0) {
    throw new StorefrontDomainError("La imagen esta vacia.", 400);
  }
  if (input.file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new StorefrontDomainError("La imagen no puede superar 4 MB.", 400);
  }

  const config = getSpacesConfig();
  const key = buildImageKey({
    organizationId: input.organizationId,
    productId: input.productId,
    extension,
  });
  const body = Buffer.from(await input.file.arrayBuffer());
  const url = getObjectUrl(config, key);
  const headers = signSpacesRequest({
    method: "PUT",
    url,
    body,
    contentType: input.file.type,
    config,
  });

  const response = await fetch(url, {
    method: "PUT",
    headers,
    body,
  });

  if (!response.ok) {
    throw new StorefrontDomainError("No se pudo subir la imagen.", 502);
  }

  return {
    url: getPublicUrl(config, key),
    alt: input.alt,
    key,
  };
}

export async function deleteStorefrontPublicationImage(input: {
  organizationId: string;
  productId: string;
  key: string;
}) {
  const key = input.key.trim();
  const expectedPrefix = `${buildImageKeyPrefix(input)}/`;
  if (!key || !key.startsWith(expectedPrefix)) {
    throw new StorefrontDomainError("Imagen invalida.", 400);
  }

  const config = getSpacesConfig();
  const url = getObjectUrl(config, key);
  const headers = signSpacesRequest({
    method: "DELETE",
    url,
    config,
  });

  const response = await fetch(url, {
    method: "DELETE",
    headers,
  });

  if (!response.ok) {
    throw new StorefrontDomainError("No se pudo eliminar la imagen.", 502);
  }
}
