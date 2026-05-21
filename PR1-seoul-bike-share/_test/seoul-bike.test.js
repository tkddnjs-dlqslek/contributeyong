const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeSeoulBikeStationsQuery,
  normalizeSeoulBikeNearestQuery,
  normalizeSeoulBikeSearchQuery,
  proxySeoulBikeStations,
  proxySeoulBikeNearest,
  proxySeoulBikeSearch,
  isSeoulBikeErrorBody,
  haversineDistanceMeters,
  SEOUL_BIKE_MAX_PAGE_SIZE
} = require("../packages/k-skill-proxy/src/seoul-bike");

// ---------- normalize: stations ----------

test("normalizeSeoulBikeStationsQuery defaults to 1..1000", () => {
  const out = normalizeSeoulBikeStationsQuery({});
  assert.deepEqual(out, { start: 1, end: 1000 });
});

test("normalizeSeoulBikeStationsQuery accepts custom range", () => {
  const out = normalizeSeoulBikeStationsQuery({ start: 1001, end: 2000 });
  assert.deepEqual(out, { start: 1001, end: 2000 });
});

test("normalizeSeoulBikeStationsQuery rejects end < start", () => {
  assert.throws(() => normalizeSeoulBikeStationsQuery({ start: 100, end: 50 }),
    /end >= start/);
});

test("normalizeSeoulBikeStationsQuery rejects range > 1000", () => {
  assert.throws(() => normalizeSeoulBikeStationsQuery({ start: 1, end: 1500 }),
    /at most 1000/);
});

test("normalizeSeoulBikeStationsQuery rejects non-integer", () => {
  assert.throws(() => normalizeSeoulBikeStationsQuery({ start: "abc" }),
    /Provide start as an integer/);
});

test("normalizeSeoulBikeStationsQuery rejects start < 1", () => {
  assert.throws(() => normalizeSeoulBikeStationsQuery({ start: 0 }),
    /start >= 1/);
});

// ---------- normalize: nearest ----------

test("normalizeSeoulBikeNearestQuery accepts valid Seoul coords", () => {
  const out = normalizeSeoulBikeNearestQuery({ lat: "37.4979", lng: "127.0276" });
  assert.deepEqual(out, { lat: 37.4979, lng: 127.0276, limit: 5, minBikes: 0 });
});

test("normalizeSeoulBikeNearestQuery applies default limit 5", () => {
  const out = normalizeSeoulBikeNearestQuery({ lat: 37.5, lng: 127 });
  assert.equal(out.limit, 5);
});

test("normalizeSeoulBikeNearestQuery accepts custom limit", () => {
  const out = normalizeSeoulBikeNearestQuery({ lat: 37.5, lng: 127, limit: 10 });
  assert.equal(out.limit, 10);
});

test("normalizeSeoulBikeNearestQuery caps limit at 50", () => {
  assert.throws(() => normalizeSeoulBikeNearestQuery({ lat: 37.5, lng: 127, limit: 100 }),
    /limit <= 50/);
});

test("normalizeSeoulBikeNearestQuery requires lat", () => {
  assert.throws(() => normalizeSeoulBikeNearestQuery({ lng: 127 }),
    /Provide lat/);
});

test("normalizeSeoulBikeNearestQuery rejects lat outside Korea", () => {
  assert.throws(() => normalizeSeoulBikeNearestQuery({ lat: 50, lng: 127 }),
    /lat within/);
});

test("normalizeSeoulBikeNearestQuery rejects lng outside Korea", () => {
  assert.throws(() => normalizeSeoulBikeNearestQuery({ lat: 37, lng: 100 }),
    /lng within/);
});

// ---------- haversine ----------

test("haversineDistanceMeters: same point = 0", () => {
  assert.equal(haversineDistanceMeters(37.5, 127.0, 37.5, 127.0), 0);
});

test("haversineDistanceMeters: 강남역 -> 서울역 ~ 8.5km", () => {
  // 강남역 37.4979, 127.0276  -- 서울역 37.5547, 126.9707
  const m = haversineDistanceMeters(37.4979, 127.0276, 37.5547, 126.9707);
  assert.ok(m > 7800 && m < 9000, `expected ~8.5km, got ${m}`);
});

test("haversineDistanceMeters: 강남역 -> 잠실역 ~ 7km", () => {
  // 강남역 37.4979, 127.0276 -- 잠실역 37.5133, 127.1000
  const m = haversineDistanceMeters(37.4979, 127.0276, 37.5133, 127.1000);
  assert.ok(m > 6000 && m < 8000, `expected ~7km, got ${m}`);
});

// ---------- isSeoulBikeErrorBody ----------

test("isSeoulBikeErrorBody: empty body = error", () => {
  assert.equal(isSeoulBikeErrorBody(""), true);
});

test("isSeoulBikeErrorBody: INFO-000 = ok", () => {
  const body = JSON.stringify({
    rentBikeStatus: { RESULT: { CODE: "INFO-000" }, row: [] }
  });
  assert.equal(isSeoulBikeErrorBody(body), false);
});

test("isSeoulBikeErrorBody: INFO-200 = error", () => {
  const body = JSON.stringify({
    rentBikeStatus: { RESULT: { CODE: "INFO-200", MESSAGE: "데이터 없음" } }
  });
  assert.equal(isSeoulBikeErrorBody(body), true);
});

test("isSeoulBikeErrorBody: INFO-300 (key not registered) = error", () => {
  const body = JSON.stringify({
    RESULT: { CODE: "INFO-300", MESSAGE: "관리자 인증키 미등록" }
  });
  assert.equal(isSeoulBikeErrorBody(body), true);
});

test("isSeoulBikeErrorBody: { error } object = error", () => {
  const body = JSON.stringify({ error: "upstream_not_configured" });
  assert.equal(isSeoulBikeErrorBody(body), true);
});

test("isSeoulBikeErrorBody: non-JSON = error", () => {
  assert.equal(isSeoulBikeErrorBody("<html>oops</html>"), true);
});

// ---------- proxySeoulBikeStations ----------

test("proxySeoulBikeStations: missing serviceKey -> 503", async () => {
  const out = await proxySeoulBikeStations({
    query: { start: 1, end: 1000 },
    serviceKey: null,
    fetchImpl: () => { throw new Error("must not be called"); }
  });
  assert.equal(out.statusCode, 503);
  const parsed = JSON.parse(out.body);
  assert.equal(parsed.error, "upstream_not_configured");
});

test("proxySeoulBikeStations: passes through upstream response", async () => {
  const upstreamBody = JSON.stringify({
    rentBikeStatus: { list_total_count: 2, RESULT: { CODE: "INFO-000" }, row: [{ stationId: "A" }, { stationId: "B" }] }
  });
  const mockFetch = async (url) => {
    assert.ok(String(url).includes("/SECRET/json/bikeList/1/1000/"));
    return {
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => upstreamBody
    };
  };
  const out = await proxySeoulBikeStations({
    query: { start: 1, end: 1000 },
    serviceKey: "SECRET",
    fetchImpl: mockFetch
  });
  assert.equal(out.statusCode, 200);
  assert.equal(out.body, upstreamBody);
});

// ---------- proxySeoulBikeNearest ----------

function makeFakeStation(i, lat, lng, parking = 5, rack = 10) {
  return {
    stationId: `ST-${i}`,
    stationName: `Station ${i}`,
    stationLatitude: String(lat),
    stationLongitude: String(lng),
    parkingBikeTotCnt: String(parking),
    rackTotCnt: String(rack),
    shared: "50"
  };
}

test("proxySeoulBikeNearest: missing serviceKey -> 503", async () => {
  const out = await proxySeoulBikeNearest({
    query: { lat: 37.5, lng: 127, limit: 5 },
    serviceKey: null,
    fetchImpl: () => { throw new Error("must not be called"); }
  });
  assert.equal(out.statusCode, 503);
});

test("proxySeoulBikeNearest: ranks by distance, returns top N", async () => {
  // Page 1: 3 stations near 37.5, 127.0; page 2: returns < 1000 so loop stops
  const page1 = [
    makeFakeStation(1, 37.4979, 127.0276, 3, 15),  // ~3.0 km from query
    makeFakeStation(2, 37.5000, 127.0000, 7, 10),  // ~ 0 m  (query itself)
    makeFakeStation(3, 37.5547, 126.9707, 0, 10),  // ~ far away (서울역)
  ];
  let calls = 0;
  const mockFetch = async (url) => {
    calls++;
    if (calls === 1) {
      return {
        status: 200,
        headers: { get: () => "application/json" },
        text: async () => JSON.stringify({ rentBikeStatus: { row: page1 } })
      };
    }
    // empty -> loop stops
    return {
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify({ rentBikeStatus: { row: [] } })
    };
  };

  const out = await proxySeoulBikeNearest({
    query: { lat: 37.5, lng: 127.0, limit: 2 },
    serviceKey: "SECRET",
    fetchImpl: mockFetch
  });
  assert.equal(out.statusCode, 200);
  const parsed = JSON.parse(out.body);
  const rows = parsed.rentBikeStatus.row;
  assert.equal(rows.length, 2, `expected top-2, got ${rows.length}`);
  // closest first: ST-2 (origin point), then ST-1 (강남역)
  assert.equal(rows[0].stationId, "ST-2");
  assert.equal(rows[1].stationId, "ST-1");
  // availableRacks computed
  assert.equal(rows[0].availableRacks, 10 - 7);  // rack - parking
  assert.equal(rows[1].availableRacks, 15 - 3);
  // distanceMeters present and increasing
  assert.ok(rows[0].distanceMeters < rows[1].distanceMeters);
});

test("proxySeoulBikeNearest: filters out stations with invalid coords", async () => {
  const page1 = [
    makeFakeStation(1, 37.5, 127.0),
    { ...makeFakeStation(2, 37.5, 127.0), stationLatitude: "NaN" },
    { ...makeFakeStation(3, 37.5, 127.0), stationLatitude: undefined },
  ];
  const mockFetch = async () => ({
    status: 200,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify({ rentBikeStatus: { row: page1 } })
  });
  const out = await proxySeoulBikeNearest({
    query: { lat: 37.5, lng: 127, limit: 10 },
    serviceKey: "SECRET",
    fetchImpl: mockFetch
  });
  const rows = JSON.parse(out.body).rentBikeStatus.row;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stationId, "ST-1");
});

test("proxySeoulBikeNearest: paginates through multiple pages of 1000", async () => {
  // Simulate two full pages then empty
  const page1 = Array.from({ length: SEOUL_BIKE_MAX_PAGE_SIZE }, (_, i) =>
    makeFakeStation(`p1-${i}`, 37.5 + i * 0.0001, 127.0 + i * 0.0001));
  const page2 = Array.from({ length: 500 }, (_, i) =>
    makeFakeStation(`p2-${i}`, 37.6 + i * 0.0001, 127.1 + i * 0.0001));
  let calls = 0;
  const mockFetch = async (url) => {
    calls++;
    const body = calls === 1
      ? { rentBikeStatus: { row: page1 } }
      : calls === 2
        ? { rentBikeStatus: { row: page2 } }
        : { rentBikeStatus: { row: [] } };
    return {
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify(body)
    };
  };
  const out = await proxySeoulBikeNearest({
    query: { lat: 37.5, lng: 127, limit: 3 },
    serviceKey: "SECRET",
    fetchImpl: mockFetch
  });
  assert.equal(out.statusCode, 200);
  // Should have called at least 2 pages (page1 had 1000 -> needs another page,
  // page2 had 500 < 1000 -> stops)
  assert.equal(calls, 2, `expected 2 pages, got ${calls}`);
  const parsed = JSON.parse(out.body);
  assert.equal(parsed.rentBikeStatus.list_total_count, 1500);
  assert.equal(parsed.rentBikeStatus.row.length, 3);
});

test("proxySeoulBikeNearest: upstream non-2xx is surfaced", async () => {
  const mockFetch = async () => ({
    status: 429,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify({ error: "rate limited" })
  });
  const out = await proxySeoulBikeNearest({
    query: { lat: 37.5, lng: 127, limit: 5 },
    serviceKey: "SECRET",
    fetchImpl: mockFetch
  });
  assert.equal(out.statusCode, 429);
});

// ---------- normalize: search ----------

test("normalizeSeoulBikeSearchQuery: accepts query + default limit", () => {
  assert.deepEqual(normalizeSeoulBikeSearchQuery({ query: "망원역" }), { query: "망원역", limit: 5, minBikes: 0 });
});

test("normalizeSeoulBikeSearchQuery: accepts q alias and custom limit", () => {
  assert.deepEqual(normalizeSeoulBikeSearchQuery({ q: "강남", limit: 10 }), { query: "강남", limit: 10, minBikes: 0 });
});

test("normalizeSeoulBikeSearchQuery: missing query rejected", () => {
  assert.throws(() => normalizeSeoulBikeSearchQuery({}), /Provide query/);
});

test("normalizeSeoulBikeSearchQuery: overly long query rejected", () => {
  assert.throws(() => normalizeSeoulBikeSearchQuery({ query: "x".repeat(51) }), /up to 50 characters/);
});

// ---------- proxySeoulBikeSearch ----------

test("proxySeoulBikeSearch: missing serviceKey -> 503", async () => {
  const out = await proxySeoulBikeSearch({
    query: { query: "망원", limit: 5 },
    serviceKey: null,
    fetchImpl: () => { throw new Error("must not be called"); }
  });
  assert.equal(out.statusCode, 503);
});

test("proxySeoulBikeSearch: filters by station name substring", async () => {
  const rows = [
    makeFakeStation(1, 37.55, 126.91), // Station 1
    { ...makeFakeStation(2, 37.50, 127.00), stationName: "102. 망원역 1번출구 앞" },
    { ...makeFakeStation(3, 37.51, 127.01), stationName: "103. 망원역 2번출구 앞" },
    { ...makeFakeStation(4, 37.49, 127.02), stationName: "207. 여의나루역 1번출구 앞" }
  ];
  let calls = 0;
  const mockFetch = async () => {
    calls++;
    const body = calls === 1 ? { rentBikeStatus: { row: rows } } : { rentBikeStatus: { row: [] } };
    return { status: 200, headers: { get: () => "application/json" }, text: async () => JSON.stringify(body) };
  };
  const out = await proxySeoulBikeSearch({
    query: { query: "망원역", limit: 10 },
    serviceKey: "SECRET",
    fetchImpl: mockFetch
  });
  assert.equal(out.statusCode, 200);
  const matched = JSON.parse(out.body).rentBikeStatus.row;
  assert.equal(matched.length, 2);
  assert.ok(matched.every((s) => s.stationName.includes("망원역")));
  // search results have NO distanceMeters (no origin)
  assert.equal(matched[0].distanceMeters, undefined);
  // but DO carry availableRacks
  assert.ok("availableRacks" in matched[0]);
});

test("proxySeoulBikeSearch: case-insensitive and respects limit", async () => {
  const rows = [
    { ...makeFakeStation(1, 37.5, 127.0), stationName: "ABC Station" },
    { ...makeFakeStation(2, 37.5, 127.0), stationName: "abc Annex" },
    { ...makeFakeStation(3, 37.5, 127.0), stationName: "ABC Tower" }
  ];
  const mockFetch = async () => ({ status: 200, headers: { get: () => "application/json" }, text: async () => JSON.stringify({ rentBikeStatus: { row: rows } }) });
  const out = await proxySeoulBikeSearch({ query: { query: "abc", limit: 2 }, serviceKey: "K", fetchImpl: mockFetch });
  const matched = JSON.parse(out.body).rentBikeStatus.row;
  assert.equal(matched.length, 2);
});

// ---------- #1 minBikes / available filter ----------

test("normalizeSeoulBikeNearestQuery: minBikes default 0, available=true -> 1", () => {
  assert.equal(normalizeSeoulBikeNearestQuery({ lat: 37.5, lng: 127 }).minBikes, 0);
  assert.equal(normalizeSeoulBikeNearestQuery({ lat: 37.5, lng: 127, available: "true" }).minBikes, 1);
  assert.equal(normalizeSeoulBikeNearestQuery({ lat: 37.5, lng: 127, minBikes: "3" }).minBikes, 3);
});

test("proxySeoulBikeNearest: minBikes filters out empty stations", async () => {
  const rows = [
    makeFakeStation(1, 37.5001, 127.0001, 0, 15), // 0 bikes
    makeFakeStation(2, 37.5002, 127.0002, 5, 10)  // 5 bikes
  ];
  const mockFetch = async () => ({ status: 200, headers: { get: () => "application/json" }, text: async () => JSON.stringify({ rentBikeStatus: { row: rows } }) });
  const out = await proxySeoulBikeNearest({ query: { lat: 37.5, lng: 127, limit: 10, minBikes: 1 }, serviceKey: "K", fetchImpl: mockFetch });
  const result = JSON.parse(out.body).rentBikeStatus.row;
  assert.equal(result.length, 1);
  assert.equal(result[0].stationId, "ST-2");
});

test("proxySeoulBikeSearch: minBikes filter applies", async () => {
  const rows = [
    { ...makeFakeStation(1, 37.5, 127.0, 0, 15), stationName: "망원역 1번" },
    { ...makeFakeStation(2, 37.5, 127.0, 4, 10), stationName: "망원역 2번" }
  ];
  const mockFetch = async () => ({ status: 200, headers: { get: () => "application/json" }, text: async () => JSON.stringify({ rentBikeStatus: { row: rows } }) });
  const out = await proxySeoulBikeSearch({ query: { query: "망원역", limit: 10, minBikes: 1 }, serviceKey: "K", fetchImpl: mockFetch });
  const result = JSON.parse(out.body).rentBikeStatus.row;
  assert.equal(result.length, 1);
  assert.equal(result[0].stationName, "망원역 2번");
});
