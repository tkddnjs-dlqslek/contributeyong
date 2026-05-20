# Patch: `packages/k-skill-proxy/src/server.js`

본 PR 에서 `server.js` 에 추가해야 하는 변경 세 군데. 라인 번호는 `main` 브랜치 기준 참고용이며, 머지 시점에 따라 ±10 줄 가량 밀릴 수 있다.

---

## 1. Import 블록 추가 — 기존 `kstartup` import 바로 아래 (~line 34)

```js
const {
  isKstartupErrorBody,
  normalizeKstartupQuery,
  proxyKstartupRequest
} = require("./kstartup");
// ↓ 아래 블록을 신규 추가
const {
  isSeoulBikeErrorBody,
  normalizeSeoulBikeStationsQuery,
  normalizeSeoulBikeNearestQuery,
  normalizeSeoulBikeSearchQuery,
  proxySeoulBikeStations,
  proxySeoulBikeNearest,
  proxySeoulBikeSearch
} = require("./seoul-bike");
```

---

## 2. `/health` 상태 응답에 configured flag 추가 — `seoulOpenApiConfigured` 옆 (~line 1601)

```js
seoulOpenApiConfigured: Boolean(config.seoulOpenApiKey),
// 기존 seoulOpenApiConfigured 가 따릉이도 같은 키를 쓰므로 별도 flag 는 추가하지 않는다.
// dataset 활용신청 상태는 라우트 호출 시 INFO-200 등 upstream 코드로 노출된다.
```

(코드 추가 없음. 변경 없음을 명시.)

---

## 3. 라우트 핸들러 + 등록 — 기존 `kstartup` 라우트 4 개 묶음 바로 아래 (~line 3095)

기존 `kstartup` 핸들러 패턴과 동일한 형태로 추가한다. cache·error 정규화·`requested_at` 메타 포함.

```js
  async function handleSeoulBikeRoute({ route, request, reply, normalizer, fetcher, errorChecker }) {
    let normalized;
    try {
      normalized = normalizer(request.query || {});
    } catch (error) {
      reply.code(400);
      return { error: "bad_request", message: error.message };
    }

    const cacheKey = makeCacheKey({ route, ...normalized });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: { hit: true, ttl_ms: config.cacheTtlMs }
        }
      };
    }

    let upstream;
    try {
      upstream = await fetcher({
        query: normalized,
        serviceKey: config.seoulOpenApiKey
      });
    } catch (error) {
      reply.code(502);
      return {
        error: "proxy_error",
        message: "Seoul bike upstream request failed.",
        proxy: {
          name: config.proxyName,
          cache: { hit: false, ttl_ms: config.cacheTtlMs }
        }
      };
    }

    if (upstream.statusCode === 503) {
      reply.code(503);
      let upstreamPayload = null;
      try { upstreamPayload = JSON.parse(upstream.body); } catch { upstreamPayload = null; }
      return {
        error: upstreamPayload?.error || "upstream_not_configured",
        message: upstreamPayload?.message || "SEOUL_OPEN_API_KEY is not configured on the proxy server.",
        proxy: {
          name: config.proxyName,
          cache: { hit: false, ttl_ms: config.cacheTtlMs }
        }
      };
    }

    let parsed = null;
    try {
      parsed = JSON.parse(upstream.body);
    } catch {
      reply.code(upstream.statusCode >= 400 ? upstream.statusCode : 502);
      return {
        error: "upstream_invalid_response",
        message: "Seoul bike upstream did not return valid JSON.",
        upstream_status: upstream.statusCode,
        upstream_body: upstream.body.slice(0, 500),
        proxy: {
          name: config.proxyName,
          cache: { hit: false, ttl_ms: config.cacheTtlMs }
        }
      };
    }

    if (upstream.statusCode < 200 || upstream.statusCode >= 300 || errorChecker(upstream.body)) {
      reply.code(upstream.statusCode >= 400 ? upstream.statusCode : 502);
      return {
        ...parsed,
        error: parsed?.error || "upstream_error",
        proxy: {
          name: config.proxyName,
          cache: { hit: false, ttl_ms: config.cacheTtlMs },
          requested_at: new Date().toISOString()
        }
      };
    }

    const payload = {
      ...parsed,
      query: normalized,
      proxy: {
        name: config.proxyName,
        cache: { hit: false, ttl_ms: config.cacheTtlMs },
        requested_at: new Date().toISOString()
      }
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  }

  app.get("/v1/seoul-bike/nearest", async (request, reply) => handleSeoulBikeRoute({
    route: "seoul-bike-nearest",
    request,
    reply,
    normalizer: normalizeSeoulBikeNearestQuery,
    fetcher: proxySeoulBikeNearest,
    errorChecker: isSeoulBikeErrorBody
  }));

  app.get("/v1/seoul-bike/stations", async (request, reply) => handleSeoulBikeRoute({
    route: "seoul-bike-stations",
    request,
    reply,
    normalizer: normalizeSeoulBikeStationsQuery,
    fetcher: proxySeoulBikeStations,
    errorChecker: isSeoulBikeErrorBody
  }));

  app.get("/v1/seoul-bike/search", async (request, reply) => handleSeoulBikeRoute({
    route: "seoul-bike-search",
    request,
    reply,
    normalizer: normalizeSeoulBikeSearchQuery,
    fetcher: proxySeoulBikeSearch,
    errorChecker: isSeoulBikeErrorBody
  }));
```

---

## 4. 하단 `module.exports` 에 추가 — 기존 `proxySeoulSubwayRequest` 근처 (~line 4328)

```js
module.exports = {
  // ... 기존 export 들
  proxyKstartupRequest,
  proxySeoulBikeNearest,        // ← 추가
  proxySeoulBikeStations,       // ← 추가
  proxySeoulBikeSearch,         // ← 추가
  proxySeoulCityDataRequest,
  proxySeoulSubwayRequest,
  // ... 나머지
};
```

(테스트에서 import 가능하도록 export 만 추가.)
