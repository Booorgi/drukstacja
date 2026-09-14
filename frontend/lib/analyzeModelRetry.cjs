/** Ponawianie /api/analyze-model zanim studio spadnie na RFQ. */

const ANALYZE_3MF_ATTEMPT_MS = 50_000;
const ANALYZE_3MF_MAX_ATTEMPTS = 3;
const ANALYZE_DEFAULT_ATTEMPT_MS = 55_000;

function isRetryableAnalyzeFailure({ name, message, status } = {}) {
  const code = Number(status);
  if (code === 408 || code === 429 || code === 502 || code === 503 || code === 504) {
    return true;
  }
  if (name === "AbortError") return true;
  const msg = String(message || "");
  if (msg === "Failed to fetch" || name === "TypeError") return true;
  return /timeout|timed out|network|ECONNRESET|502|503|504/i.test(msg);
}

function analyzeClientOutcome({
  ok,
  instantPricing,
  quoteReady,
  previewUrl,
  peekedQuote,
} = {}) {
  if (ok && instantPricing && quoteReady && previewUrl) return "quoted";
  if (ok && instantPricing && quoteReady) return "quoted_no_preview";
  if (!ok && peekedQuote) return "quoted_no_preview";
  return "rfq";
}

function logAnalyzeAttempt(payload) {
  console.info("[ANALYZE]", payload);
}

async function fetchAnalyzeModelWithRetry({
  url,
  buildBody,
  is3mf,
  fetchFn = fetch,
  sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  AbortControllerFn = AbortController,
} = {}) {
  const maxAttempts = is3mf ? ANALYZE_3MF_MAX_ATTEMPTS : 1;
  const timeoutMs = is3mf ? ANALYZE_3MF_ATTEMPT_MS : ANALYZE_DEFAULT_ATTEMPT_MS;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortControllerFn();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const res = await fetchFn(url, {
        method: "POST",
        body: typeof buildBody === "function" ? buildBody() : buildBody,
        signal: controller.signal,
      });
      const retryableStatus = isRetryableAnalyzeFailure({ status: res.status });
      if (!res.ok && retryableStatus && attempt < maxAttempts) {
        lastErr = new Error(`HTTP ${res.status}`);
        lastErr.status = res.status;
        lastErr.retryable = true;
        logAnalyzeAttempt({
          attempt,
          elapsed_ms: Date.now() - started,
          status: res.status,
          retry: true,
          reason: "transient_http",
        });
        await sleepFn(400 * attempt);
        continue;
      }
      logAnalyzeAttempt({
        attempt,
        elapsed_ms: Date.now() - started,
        status: res.status,
        retry: false,
        reason: res.ok ? "ok" : "http_error",
      });
      return res;
    } catch (err) {
      lastErr = err;
      const retryable = isRetryableAnalyzeFailure(err);
      logAnalyzeAttempt({
        attempt,
        elapsed_ms: Date.now() - started,
        status: null,
        retry: retryable && attempt < maxAttempts,
        reason: err && err.name === "AbortError" ? "abort" : "network",
        message: err && err.message,
      });
      if (retryable && attempt < maxAttempts) {
        await sleepFn(400 * attempt);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw lastErr;
}

module.exports = {
  ANALYZE_3MF_ATTEMPT_MS,
  ANALYZE_3MF_MAX_ATTEMPTS,
  ANALYZE_DEFAULT_ATTEMPT_MS,
  isRetryableAnalyzeFailure,
  analyzeClientOutcome,
  logAnalyzeAttempt,
  fetchAnalyzeModelWithRetry,
};
