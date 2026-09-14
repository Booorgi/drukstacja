const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  isRetryableAnalyzeFailure,
  analyzeClientOutcome,
  fetchAnalyzeModelWithRetry,
  ANALYZE_3MF_MAX_ATTEMPTS,
} = require("./analyzeModelRetry.cjs");

test("retries abort, Failed to fetch, and 502/503/504", () => {
  assert.equal(isRetryableAnalyzeFailure({ name: "AbortError" }), true);
  assert.equal(isRetryableAnalyzeFailure({ message: "Failed to fetch", name: "TypeError" }), true);
  assert.equal(isRetryableAnalyzeFailure({ status: 502 }), true);
  assert.equal(isRetryableAnalyzeFailure({ status: 503 }), true);
  assert.equal(isRetryableAnalyzeFailure({ status: 504 }), true);
  assert.equal(isRetryableAnalyzeFailure({ status: 400 }), false);
  assert.equal(isRetryableAnalyzeFailure({ message: "Nieznany materiał" }), false);
});

test("slow successful JSON is quoted, not too-large RFQ", () => {
  assert.equal(
    analyzeClientOutcome({
      ok: true,
      instantPricing: true,
      quoteReady: true,
      previewUrl: "/api/cached-model/x.stl",
    }),
    "quoted"
  );
  assert.equal(
    analyzeClientOutcome({
      ok: true,
      instantPricing: true,
      quoteReady: true,
      previewUrl: null,
    }),
    "quoted_no_preview"
  );
  assert.equal(
    analyzeClientOutcome({
      ok: false,
      peekedQuote: { filament_weight_g: 98.6 },
    }),
    "quoted_no_preview"
  );
  assert.equal(analyzeClientOutcome({ ok: false }), "rfq");
});

test("3MF retries transient 502 then returns success", async () => {
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    if (calls < 3) {
      return { ok: false, status: 502 };
    }
    return { ok: true, status: 200 };
  };
  const res = await fetchAnalyzeModelWithRetry({
    url: "/api/analyze-model",
    buildBody: () => "fd",
    is3mf: true,
    fetchFn,
    sleepFn: async () => {},
  });
  assert.equal(calls, 3);
  assert.equal(res.status, 200);
  assert.equal(ANALYZE_3MF_MAX_ATTEMPTS, 3);
});

test("non-3MF does not retry 502", async () => {
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    return { ok: false, status: 502 };
  };
  const res = await fetchAnalyzeModelWithRetry({
    url: "/api/analyze-model",
    buildBody: () => "fd",
    is3mf: false,
    fetchFn,
    sleepFn: async () => {},
  });
  assert.equal(calls, 1);
  assert.equal(res.status, 502);
});

test("rebuilds body each attempt so FormData is not reused", async () => {
  const bodies = [];
  const fetchFn = async (_url, opts) => {
    bodies.push(opts.body);
    if (bodies.length < 2) {
      const err = new Error("Failed to fetch");
      err.name = "TypeError";
      throw err;
    }
    return { ok: true, status: 200 };
  };
  let n = 0;
  await fetchAnalyzeModelWithRetry({
    url: "/api/analyze-model",
    buildBody: () => `body-${++n}`,
    is3mf: true,
    fetchFn,
    sleepFn: async () => {},
  });
  assert.deepEqual(bodies, ["body-1", "body-2"]);
});
