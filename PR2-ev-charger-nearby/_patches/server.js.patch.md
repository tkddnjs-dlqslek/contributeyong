# Patch: `packages/k-skill-proxy/src/server.js`

라인 번호는 `main`/`dev` 기준 참고용. 머지 시점에 따라 밀릴 수 있으니 맥락으로 위치 확인.

> PR1(`seoul-bike-share`)이 먼저 머지된다면 그 import/route/export 바로 아래에 이어서 추가하면 깔끔하다.

---

## 1. Import 블록 추가 — 기존 data.go.kr 핸들러 import 묶음 근처

```js
const {
  isEvChargerErrorBody,
  normalizeEvChargerNearestQuery,
  normalizeEvChargerStatusQuery,
  proxyEvChargerNearest,
  proxyEvChargerStatus
} = require("./ev-charger");
```

---

## 2. `/health` configured flag (선택) — `molitConfigured` 옆

```js
// EV charger reuses DATA_GO_KR_API_KEY (config.molitApiKey). 별도 flag 불필요.
// evChargerConfigured: Boolean(config.molitApiKey)   // 원하면 추가
```

---

## 3. 라우트 핸들러 + 등록 — kstartup / seoul-bike 라우트 묶음 아래

```js
  async function handleEvChargerRoute({ route, request, reply, normalizer, fetcher }) {
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
        proxy: { ...cached.proxy, cache: { hit: true, ttl_ms: config.cacheTtlMs } }
      };
    }

    let upstream;
    try {
      upstream = await fetcher({ query: normalized, serviceKey: config.molitApiKey });
    } catch (error) {
      reply.code(502);
      return {
        error: "proxy_error",
        message: "EV charger upstream request failed.",
        proxy: { name: config.proxyName, cache: { hit: false, ttl_ms: config.cacheTtlMs } }
      };
    }

    if (upstream.statusCode === 503) {
      reply.code(503);
      let p = null;
      try { p = JSON.parse(upstream.body); } catch { p = null; }
      return {
        error: p?.error || "upstream_not_configured",
        message: p?.message || "DATA_GO_KR_API_KEY is not configured on the proxy server.",
        proxy: { name: config.proxyName, cache: { hit: false, ttl_ms: config.cacheTtlMs } }
      };
    }

    let parsed = null;
    try {
      parsed = JSON.parse(upstream.body);
    } catch {
      reply.code(upstream.statusCode >= 400 ? upstream.statusCode : 502);
      return {
        error: "upstream_invalid_response",
        message: "EV charger upstream did not return valid JSON.",
        upstream_status: upstream.statusCode,
        upstream_body: upstream.body.slice(0, 500),
        proxy: { name: config.proxyName, cache: { hit: false, ttl_ms: config.cacheTtlMs } }
      };
    }

    if (upstream.statusCode < 200 || upstream.statusCode >= 300 || isEvChargerErrorBody(upstream.body)) {
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

  app.get("/v1/ev-charger/nearest", async (request, reply) => handleEvChargerRoute({
    route: "ev-charger-nearest",
    request,
    reply,
    normalizer: normalizeEvChargerNearestQuery,
    fetcher: proxyEvChargerNearest
  }));

  app.get("/v1/ev-charger/status", async (request, reply) => handleEvChargerRoute({
    route: "ev-charger-status",
    request,
    reply,
    normalizer: normalizeEvChargerStatusQuery,
    fetcher: proxyEvChargerStatus
  }));
```

> 주의: `proxyEvChargerNearest` 의 정상 응답은 `{ zcode, total_chargers_scanned, stations }` 형태라 data.go.kr 의 `response.header` envelope 가 없다. 위 핸들러의 `isEvChargerErrorBody` 는 그 경우 `false`(정상) 를 반환하므로 그대로 통과한다. `proxyEvChargerStatus` 는 upstream envelope 를 그대로 pass-through 하므로 `isEvChargerErrorBody` 가 resultCode 를 보고 판정한다.

---

## 4. 하단 `module.exports` 에 추가

```js
  proxyEvChargerNearest,   // ← 추가
  proxyEvChargerStatus,    // ← 추가
```
