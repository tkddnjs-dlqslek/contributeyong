# Append to `packages/k-skill-proxy/test/server.test.js`

아래 블록을 기존 `packages/k-skill-proxy/test/server.test.js` 끝에 그대로 붙여넣는다. 기존 seoul-density / seoul-subway 테스트와 동일한 관용구(`buildServer`, `app.inject`, `global.fetch` mock, `new Response(...)`)를 사용한다.

> 이 블록은 전체 `server.js` (모든 라우트 wiring 포함) 가 있어야 실행되므로 본인 포크의 실제 테스트 파일에서 `node --test packages/k-skill-proxy/test/server.test.js` 로 검증한다.

```js
// ---------------------------------------------------------------------------
// seoul-bike-share routes
// ---------------------------------------------------------------------------

function seoulBikeRow(i, lat, lng, parking = 5, rack = 10) {
  return {
    stationId: `ST-${i}`,
    stationName: `${i}. 테스트대여소`,
    stationLatitude: String(lat),
    stationLongitude: String(lng),
    parkingBikeTotCnt: String(parking),
    rackTotCnt: String(rack),
    shared: "50"
  };
}

test("seoul-bike nearest caches by coordinate+limit and computes availableRacks", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        rentBikeStatus: {
          RESULT: { CODE: "INFO-000" },
          row: [
            seoulBikeRow(1, 37.5001, 127.0001, 3, 15),
            seoulBikeRow(2, 37.55, 127.05, 7, 10)
          ]
        }
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({
    env: { SEOUL_OPEN_API_KEY: "seoul-key", KSKILL_PROXY_CACHE_TTL_MS: "60000" }
  });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = "/v1/seoul-bike/nearest?lat=37.5&lng=127.0&limit=2";
  const first = await app.inject({ method: "GET", url });
  const second = await app.inject({ method: "GET", url });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(fetchCalls, 1);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);

  const rows = first.json().rentBikeStatus.row;
  assert.equal(rows[0].stationId, "ST-1"); // nearest first
  assert.equal(rows[0].availableRacks, 15 - 3);
  assert.ok(rows[0].distanceMeters < rows[1].distanceMeters);
});

test("seoul-bike nearest stays publicly callable and hits bikeList upstream", async (t) => {
  const originalFetch = global.fetch;
  let calledUrl;
  global.fetch = async (url) => {
    calledUrl = String(url);
    return new Response(
      JSON.stringify({ rentBikeStatus: { RESULT: { CODE: "INFO-000" }, row: [seoulBikeRow(1, 37.5, 127.0)] } }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };
  const app = buildServer({ env: { SEOUL_OPEN_API_KEY: "seoul-key" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({ method: "GET", url: "/v1/seoul-bike/nearest?lat=37.5&lng=127.0" });
  assert.equal(response.statusCode, 200);
  assert.match(calledUrl, /\/seoul-key\/json\/bikeList\/1\/1000\//);
});

test("seoul-bike nearest returns 503 when proxy lacks Seoul API key", async (t) => {
  const app = buildServer();
  t.after(async () => { await app.close(); });
  const response = await app.inject({ method: "GET", url: "/v1/seoul-bike/nearest?lat=37.5&lng=127.0" });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("seoul-bike nearest returns 400 when lat/lng missing", async (t) => {
  const app = buildServer({ env: { SEOUL_OPEN_API_KEY: "seoul-key" } });
  t.after(async () => { await app.close(); });
  const response = await app.inject({ method: "GET", url: "/v1/seoul-bike/nearest?lat=37.5" });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("seoul-bike search filters by station-name keyword", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(
    JSON.stringify({
      rentBikeStatus: {
        RESULT: { CODE: "INFO-000" },
        row: [
          { ...seoulBikeRow(1, 37.55, 126.91), stationName: "102. 망원역 1번출구 앞" },
          { ...seoulBikeRow(2, 37.50, 127.00), stationName: "207. 여의나루역 1번출구 앞" }
        ]
      }
    }),
    { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
  );
  const app = buildServer({ env: { SEOUL_OPEN_API_KEY: "seoul-key" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/seoul-bike/search?query=" + encodeURIComponent("망원역")
  });
  assert.equal(response.statusCode, 200);
  const rows = response.json().rentBikeStatus.row;
  assert.equal(rows.length, 1);
  assert.match(rows[0].stationName, /망원역/);
});

test("seoul-bike search returns 400 when query missing", async (t) => {
  const app = buildServer({ env: { SEOUL_OPEN_API_KEY: "seoul-key" } });
  t.after(async () => { await app.close(); });
  const response = await app.inject({ method: "GET", url: "/v1/seoul-bike/search" });
  assert.equal(response.statusCode, 400);
});
```
