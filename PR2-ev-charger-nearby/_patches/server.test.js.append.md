# Append to `packages/k-skill-proxy/test/server.test.js`

아래 블록을 기존 `packages/k-skill-proxy/test/server.test.js` 끝에 붙여넣는다. 기존 kstartup 테스트와 동일한 관용구(`buildServer`, `app.inject`, `global.fetch` mock, `new Response(...)`)를 사용한다.

> 전체 `server.js` 가 있어야 실행되므로 본인 포크의 실제 테스트 파일에서 `node --test packages/k-skill-proxy/test/server.test.js` 로 검증한다.
> ChargEV 의 실제 응답 envelope 은 flat 구조(`resultCode`/`items.item`/`totalCount` 가 최상위)임을 라이브로 확인했으므로 mock 도 flat shape 을 쓴다.

```js
// ---------------------------------------------------------------------------
// ev-charger-nearby routes
// ---------------------------------------------------------------------------

function evChargerItem(statId, lat, lng, { chgerId = "01", chgerType = "04", stat = "2", output = "100", busiNm = "환경부" } = {}) {
  return {
    statNm: `${statId} 충전소`, statId, chgerId, chgerType,
    addr: "서울특별시 테스트구", useTime: "24시간 이용가능",
    lat: String(lat), lng: String(lng), busiNm,
    stat, statUpdDt: "20260520110000", output, method: "단독",
    zcode: "11", zscode: "11680", parkingFree: "Y"
  };
}

function evChargerFlatEnvelope(items, totalCount) {
  // ChargEV returns a flat top-level envelope (verified live 2026-05-20)
  return {
    resultMsg: "NORMAL SERVICE.",
    totalCount: totalCount ?? items.length,
    items: { item: items },
    pageNo: 1,
    resultCode: "00",
    numOfRows: items.length
  };
}

test("ev-charger nearest caches by query and groups by statId", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify(evChargerFlatEnvelope([
        evChargerItem("ME0001", 37.5001, 127.0001, { chgerId: "01" }),
        evChargerItem("ME0001", 37.5001, 127.0001, { chgerId: "02", stat: "3" }),
        evChargerItem("ME0002", 37.55, 127.05)
      ], 3)),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key", KSKILL_PROXY_CACHE_TTL_MS: "60000" } });
  t.after(async () => { global.fetch = originalFetch; await app.close(); });

  const url = "/v1/ev-charger/nearest?lat=37.5&lng=127.0&zcode=11&limit=5";
  const first = await app.inject({ method: "GET", url });
  const second = await app.inject({ method: "GET", url });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(fetchCalls, 1);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);

  const stations = first.json().stations;
  assert.equal(stations.length, 2);
  const merged = stations.find((s) => s.statId === "ME0001");
  assert.equal(merged.chargers.length, 2);
  assert.equal(merged.availableCount, 1); // only chgerId 01 is stat=2
});

test("ev-charger nearest returns 503 when DATA_GO_KR_API_KEY is missing", async (t) => {
  const app = buildServer({ env: {} });
  t.after(async () => { await app.close(); });
  const response = await app.inject({ method: "GET", url: "/v1/ev-charger/nearest?lat=37.5&lng=127.0&zcode=11" });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("ev-charger nearest returns 400 when zcode and regionHint both missing", async (t) => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; return new Response("{}", { status: 200 }); };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => { global.fetch = originalFetch; await app.close(); });

  const response = await app.inject({ method: "GET", url: "/v1/ev-charger/nearest?lat=37.5&lng=127.0" });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
  assert.equal(called, false);
});

test("ev-charger nearest resolves regionHint to zcode/zscode via region-lookup", async (t) => {
  const originalFetch = global.fetch;
  let calledUrl;
  global.fetch = async (url) => {
    calledUrl = String(url);
    return new Response(
      JSON.stringify(evChargerFlatEnvelope([evChargerItem("ME0001", 37.5, 127.0)], 1)),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => { global.fetch = originalFetch; await app.close(); });

  const response = await app.inject({
    method: "GET",
    url: "/v1/ev-charger/nearest?lat=37.5&lng=127.0&regionHint=" + encodeURIComponent("서울 강남구")
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().zscode, "11680");
  assert.equal(response.json().regionName, "서울특별시 강남구");
  assert.match(calledUrl, /zscode=11680/);
});

test("ev-charger nearest surfaces resultCode != 00 as 502 without caching", async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ resultCode: "30", resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => { global.fetch = originalFetch; await app.close(); });

  const first = await app.inject({ method: "GET", url: "/v1/ev-charger/nearest?lat=37.5&lng=127.0&zcode=11" });
  assert.equal(first.statusCode, 502);
  const second = await app.inject({ method: "GET", url: "/v1/ev-charger/nearest?lat=37.5&lng=127.0&zcode=11" });
  assert.equal(second.statusCode, 502);
  assert.equal(calls, 2, "upstream error responses must not be cached");
});

test("ev-charger status passes statId to upstream", async (t) => {
  const originalFetch = global.fetch;
  let calledUrl;
  global.fetch = async (url) => {
    calledUrl = String(url);
    return new Response(
      JSON.stringify(evChargerFlatEnvelope([evChargerItem("ME0001", 37.5, 127.0)], 1)),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => { global.fetch = originalFetch; await app.close(); });

  const response = await app.inject({ method: "GET", url: "/v1/ev-charger/status?statId=ME0001" });
  assert.equal(response.statusCode, 200);
  assert.match(calledUrl, /statId=ME0001/);
  assert.match(calledUrl, /dataType=JSON/);
});
```
