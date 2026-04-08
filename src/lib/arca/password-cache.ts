const TTL_MS = 15 * 60 * 1000;

const cache = new Map<string, { password: string; expiresAt: number }>();

export function setJobPassword(jobId: string, password: string) {
  cache.set(jobId, { password, expiresAt: Date.now() + TTL_MS });
}

export function getJobPassword(jobId: string) {
  const entry = cache.get(jobId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(jobId);
    return null;
  }
  return entry.password;
}

export function clearJobPassword(jobId: string) {
  cache.delete(jobId);
}
