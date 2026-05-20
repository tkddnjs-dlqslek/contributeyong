const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeEvChargerNearestQuery,
  normalizeEvChargerStatusQuery,
  proxyEvChargerNearest,
  proxyEvChargerStatus,
  isEvChargerErrorBody,
  groupChargersByStation,
  haversineDistanceMeters
} = require("../packages/k-skill-proxy/src/ev-charger");

// ---------- normalize: nearest ----------

test("nearest: valid query", () => {
  const out = normalizeEvChargerNearestQuery({ lat: "37.4979", lng: "127.0276", zcode: "11" });
  assert.deepEqual(out, { lat: 37.4979, lng: 127.0276, zcode: "11", zscode: null, regionName: null, limit: 5, chgerType: null, speed: null, busiNm: null, onlyAvailable: false });
});

test("nearest: accepts optional zscode (5 digits)", () => {
  const out = normalizeEvChargerNearestQuery({ lat: "37.4979", lng: "127.0276", zcode: "11", zscode: "11680" });
  assert.equal(out.zscode, "11680");
});

test("nearest: rejects malformed zscode", () => {
  assert.throws(() => normalizeEvChargerNearestQuery({ lat: 37.5, lng: 127, zcode: "11", zscode: "abc" }),
    /zscode .* 5 digits/);
});

test("nearest: zcode required", () => {
  assert.throws(() => normalizeEvChargerNearestQuery({ lat: 37.5, lng: 127 }),
    /Provide zcode/);
});

test("nearest: invalid zcode rejected", () => {
  assert.throws(() => normalizeEvChargerNearestQuery({ lat: 37.5, lng: 127, zcode: "99" }),
    /valid zcode/);
});

test("nearest: lat out of Korea rejected", () => {
  assert.throws(() => normalizeEvChargerNearestQuery({ lat: 50, lng: 127, zcode: "11" }),
    /lat within/);
});

test("nearest: limit capped at 50", () => {
  assert.throws(() => normalizeEvChargerNearestQuery({ lat: 37.5, lng: 127, zcode: "11", limit: 100 }),
    /limit <= 50/);
});

test("nearest: chgerType single-digit padded and validated", () => {
  const out = normalizeEvChargerNearestQuery({ lat: 37.5, lng: 127, zcode: "11", chgerType: "4" });
  assert.equal(out.chgerType, "04");
});

test("nearest: invalid chgerType rejected", () => {
  assert.throws(() => normalizeEvChargerNearestQuery({ lat: 37.5, lng: 127, zcode: "11", chgerType: "99" }),
    /valid chgerType/);
});

test("nearest: onlyAvailable parses truthy strings", () => {
  assert.equal(normalizeEvChargerNearestQuery({ lat: 37.5, lng: 127, zcode: "11", onlyAvailable: "true" }).onlyAvailable, true);
  assert.equal(normalizeEvChargerNearestQuery({ lat: 37.5, lng: 127, zcode: "11", onlyAvailable: "1" }).onlyAvailable, true);
  assert.equal(normalizeEvChargerNearestQuery({ lat: 37.5, lng: 127, zcode: "11", onlyAvailable: "no" }).onlyAvailable, false);
  assert.equal(normalizeEvChargerNearestQuery({ lat: 37.5, lng: 127, zcode: "11" }).onlyAvailable, false);
});

// ---------- normalize: status ----------

test("status: valid statId", () => {
  assert.deepEqual(normalizeEvChargerStatusQuery({ statId: "ME000001" }), { statId: "ME000001" });
});

test("status: missing statId rejected", () => {
  assert.throws(() => normalizeEvChargerStatusQuery({}), /Provide statId/);
});

test("status: weird statId rejected", () => {
  assert.throws(() => normalizeEvChargerStatusQuery({ statId: "drop;table" }),
    /alphanumeric station id/);
});

// ---------- groupChargersByStation ----------

function chargerRow(statId, statNm, lat, lng, chgerId, chgerType, stat) {
  return {
    statId, statNm, addr: "서울 어딘가", lat: String(lat), lng: String(lng),
    busiNm: "환경부", useTime: "24시간", parkingFree: "Y",
    chgerId, chgerType, stat: String(stat), statUpdDt: "20260520093000", output: "100"
  };
}

test("group: merges chargers under the same station", () => {
  const items = [
    chargerRow("S1", "충전소1", 37.5, 127.0, "01", "04", 2),
    chargerRow("S1", "충전소1", 37.5, 127.0, "02", "02", 3),
    chargerRow("S2", "충전소2", 37.51, 127.01, "01", "04", 2)
  ];
  const out = groupChargersByStation(items, { lat: 37.5, lng: 127.0, limit: 10 });
  assert.equal(out.length, 2);
  const s1 = out.find((s) => s.statId === "S1");
  assert.equal(s1.chargers.length, 2);
  assert.equal(s1.availableCount, 1); // only chgerId 01 is stat=2
  assert.equal(s1.chargers[0].chgerTypeName, "DC콤보");
  assert.equal(s1.chargers[0].statName, "충전대기");
  assert.equal(s1.chargers[1].statName, "충전중");
});

test("group: sorts by distance and slices to limit", () => {
  const items = [
    chargerRow("FAR", "먼곳", 37.6, 127.1, "01", "04", 2),
    chargerRow("NEAR", "가까운곳", 37.5001, 127.0001, "01", "04", 2),
    chargerRow("MID", "중간", 37.55, 127.05, "01", "04", 2)
  ];
  const out = groupChargersByStation(items, { lat: 37.5, lng: 127.0, limit: 2 });
  assert.equal(out.length, 2);
  assert.equal(out[0].statId, "NEAR");
  assert.equal(out[1].statId, "MID");
  assert.ok(out[0].distanceMeters < out[1].distanceMeters);
});

test("group: chgerType filter", () => {
  const items = [
    chargerRow("S1", "충전소1", 37.5, 127.0, "01", "04", 2),
    chargerRow("S1", "충전소1", 37.5, 127.0, "02", "02", 2)
  ];
  const out = groupChargersByStation(items, { lat: 37.5, lng: 127.0, limit: 10, chgerType: "04" });
  assert.equal(out.length, 1);
  assert.equal(out[0].chargers.length, 1);
  assert.equal(out[0].chargers[0].chgerType, "04");
});

test("group: onlyAvailable filters stations with no stat=2 charger", () => {
  const items = [
    chargerRow("S1", "충전소1", 37.5, 127.0, "01", "04", 3), // 충전중
    chargerRow("S2", "충전소2", 37.5, 127.0, "01", "04", 2)  // 충전대기
  ];
  const out = groupChargersByStation(items, { lat: 37.5, lng: 127.0, limit: 10, onlyAvailable: true });
  assert.equal(out.length, 1);
  assert.equal(out[0].statId, "S2");
});

test("group: skips invalid coords", () => {
  const items = [
    { ...chargerRow("S1", "충전소1", 37.5, 127.0, "01", "04", 2) },
    { ...chargerRow("BAD", "나쁜좌표", 0, 0, "01", "04", 2), lat: "NaN", lng: "NaN" }
  ];
  const out = groupChargersByStation(items, { lat: 37.5, lng: 127.0, limit: 10 });
  assert.equal(out.length, 1);
  assert.equal(out[0].statId, "S1");
});

// ---------- isEvChargerErrorBody ----------

test("error body: resultCode 00 = ok", () => {
  const body = JSON.stringify({ response: { header: { resultCode: "00", resultMsg: "NORMAL SERVICE." }, body: { items: { item: [] } } } });
  assert.equal(isEvChargerErrorBody(body), false);
});

test("error body: resultCode 30 (key not registered) = error", () => {
  const body = JSON.stringify({ response: { header: { resultCode: "30", resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" } } });
  assert.equal(isEvChargerErrorBody(body), true);
});

test("error body: empty/non-JSON = error", () => {
  assert.equal(isEvChargerErrorBody(""), true);
  assert.equal(isEvChargerErrorBody("<OpenAPI_ServiceResponse>"), true);
});

test("error body: { error } object = error", () => {
  assert.equal(isEvChargerErrorBody(JSON.stringify({ error: "upstream_not_configured" })), true);
});

// ---------- proxyEvChargerNearest ----------

function envelope(items, totalCount) {
  return {
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
      body: { items: { item: items }, totalCount: totalCount ?? items.length, pageNo: 1, numOfRows: 9999 }
    }
  };
}

test("proxyEvChargerNearest: missing serviceKey -> 503", async () => {
  const out = await proxyEvChargerNearest({
    query: { lat: 37.5, lng: 127, zcode: "11", limit: 5 },
    serviceKey: null,
    fetchImpl: () => { throw new Error("must not be called"); }
  });
  assert.equal(out.statusCode, 503);
  assert.equal(JSON.parse(out.body).error, "upstream_not_configured");
});

test("proxyEvChargerNearest: groups, ranks, returns stations", async () => {
  const items = [
    chargerRow("S1", "가까운충전소", 37.5001, 127.0001, "01", "04", 2),
    chargerRow("S1", "가까운충전소", 37.5001, 127.0001, "02", "02", 3),
    chargerRow("S2", "먼충전소", 37.55, 127.05, "01", "04", 2)
  ];
  const mockFetch = async () => ({
    status: 200,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(envelope(items, 3))
  });
  const out = await proxyEvChargerNearest({
    query: { lat: 37.5, lng: 127.0, zcode: "11", limit: 5 },
    serviceKey: "SECRET",
    fetchImpl: mockFetch
  });
  assert.equal(out.statusCode, 200);
  const parsed = JSON.parse(out.body);
  assert.equal(parsed.zcode, "11");
  assert.equal(parsed.total_chargers_scanned, 3);
  assert.equal(parsed.stations.length, 2);
  assert.equal(parsed.stations[0].statId, "S1");
  assert.equal(parsed.stations[0].availableCount, 1);
});

test("proxyEvChargerNearest: surfaces upstream resultCode != 00", async () => {
  const mockFetch = async () => ({
    status: 200,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify({ response: { header: { resultCode: "30", resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" } } })
  });
  const out = await proxyEvChargerNearest({
    query: { lat: 37.5, lng: 127, zcode: "11", limit: 5 },
    serviceKey: "SECRET",
    fetchImpl: mockFetch
  });
  assert.equal(out.statusCode, 502);
  assert.equal(JSON.parse(out.body).resultCode, "30");
});

test("proxyEvChargerNearest: upstream non-2xx surfaced", async () => {
  const mockFetch = async () => ({
    status: 429,
    headers: { get: () => "application/json" },
    text: async () => "{}"
  });
  const out = await proxyEvChargerNearest({
    query: { lat: 37.5, lng: 127, zcode: "11", limit: 5 },
    serviceKey: "SECRET",
    fetchImpl: mockFetch
  });
  assert.equal(out.statusCode, 429);
});

test("proxyEvChargerNearest: handles single-item (non-array) item shape", async () => {
  // data.go.kr returns a bare object (not array) when there is exactly 1 item
  const single = chargerRow("S1", "단일", 37.5, 127.0, "01", "04", 2);
  const mockFetch = async () => ({
    status: 200,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify({
      response: { header: { resultCode: "00" }, body: { items: { item: single }, totalCount: 1 } }
    })
  });
  const out = await proxyEvChargerNearest({
    query: { lat: 37.5, lng: 127, zcode: "11", limit: 5 },
    serviceKey: "SECRET",
    fetchImpl: mockFetch
  });
  const parsed = JSON.parse(out.body);
  assert.equal(parsed.stations.length, 1);
});

// ---------- proxyEvChargerStatus ----------

test("proxyEvChargerStatus: missing serviceKey -> 503", async () => {
  const out = await proxyEvChargerStatus({
    query: { statId: "ME000001" },
    serviceKey: null,
    fetchImpl: () => { throw new Error("must not be called"); }
  });
  assert.equal(out.statusCode, 503);
});

test("proxyEvChargerStatus: passes statId to upstream", async () => {
  let calledUrl = null;
  const mockFetch = async (url) => {
    calledUrl = String(url);
    return { status: 200, headers: { get: () => "application/json" }, text: async () => JSON.stringify(envelope([])) };
  };
  const out = await proxyEvChargerStatus({
    query: { statId: "ME000001" },
    serviceKey: "SECRET",
    fetchImpl: mockFetch
  });
  assert.equal(out.statusCode, 200);
  assert.ok(calledUrl.includes("statId=ME000001"));
  assert.ok(calledUrl.includes("dataType=JSON"));
});

// ---------- haversine sanity ----------

test("haversine: 강남역 -> 서울시청 ~ 8km", () => {
  const m = haversineDistanceMeters(37.4979, 127.0276, 37.5663, 126.9779);
  assert.ok(m > 7000 && m < 9500, `got ${m}`);
});

// ---------- region hint resolution (reuses region-lookup) ----------

const { normalizeEvChargerSpeed, resolveEvChargerRegion } = require("../packages/k-skill-proxy/src/ev-charger");

test("regionHint: '서울 강남구' resolves to zcode 11, zscode 11680", () => {
  const out = normalizeEvChargerNearestQuery({ lat: 37.5, lng: 127.0, regionHint: "서울 강남구" });
  assert.equal(out.zcode, "11");
  assert.equal(out.zscode, "11680");
  assert.equal(out.regionName, "서울특별시 강남구");
});

test("regionHint: ambiguous hint throws with candidates", () => {
  // '구' alone matches many 구 → ambiguous
  assert.throws(() => normalizeEvChargerNearestQuery({ lat: 37.5, lng: 127.0, regionHint: "서울특별시" }),
    /ambiguous|No region/);
});

test("regionHint: unknown hint throws", () => {
  assert.throws(() => normalizeEvChargerNearestQuery({ lat: 37.5, lng: 127.0, regionHint: "존재하지않는동네zzz" }),
    /No region matched/);
});

test("regionHint: absent -> falls back to explicit zcode", () => {
  const out = normalizeEvChargerNearestQuery({ lat: 37.5, lng: 127.0, zcode: "11" });
  assert.equal(out.zcode, "11");
  assert.equal(out.zscode, null);
  assert.equal(out.regionName, null);
});

test("resolveEvChargerRegion: returns null when no hint", () => {
  assert.equal(resolveEvChargerRegion({}), null);
});

// ---------- speed normalize ----------

test("speed: fast/급속/dc -> fast", () => {
  assert.equal(normalizeEvChargerSpeed("fast"), "fast");
  assert.equal(normalizeEvChargerSpeed("급속"), "fast");
  assert.equal(normalizeEvChargerSpeed("DC"), "fast");
});

test("speed: slow/완속/ac -> slow", () => {
  assert.equal(normalizeEvChargerSpeed("slow"), "slow");
  assert.equal(normalizeEvChargerSpeed("완속"), "slow");
  assert.equal(normalizeEvChargerSpeed("ac"), "slow");
});

test("speed: null when absent", () => {
  assert.equal(normalizeEvChargerSpeed(undefined), null);
});

test("speed: invalid throws", () => {
  assert.throws(() => normalizeEvChargerSpeed("초고속"), /fast\(급속\) or slow\(완속\)/);
});

// ---------- speed + busiNm filters in grouping ----------

function rowWithOutput(statId, lat, lng, output, busiNm, stat = 2) {
  return {
    statId, statNm: statId, addr: "서울", lat: String(lat), lng: String(lng),
    busiNm, useTime: "24시간", parkingFree: "Y",
    chgerId: "01", chgerType: "04", stat: String(stat), statUpdDt: "20260520", output: String(output)
  };
}

test("filter: speed=fast keeps >=50kW only", () => {
  const items = [
    rowWithOutput("FAST", 37.5, 127.0, 100, "환경부"),
    rowWithOutput("SLOW", 37.5, 127.0, 7, "환경부")
  ];
  const out = groupChargersByStation(items, { lat: 37.5, lng: 127.0, limit: 10, speed: "fast" });
  assert.equal(out.length, 1);
  assert.equal(out[0].statId, "FAST");
});

test("filter: speed=slow keeps <50kW only", () => {
  const items = [
    rowWithOutput("FAST", 37.5, 127.0, 100, "환경부"),
    rowWithOutput("SLOW", 37.5, 127.0, 7, "환경부")
  ];
  const out = groupChargersByStation(items, { lat: 37.5, lng: 127.0, limit: 10, speed: "slow" });
  assert.equal(out.length, 1);
  assert.equal(out[0].statId, "SLOW");
});

test("filter: busiNm substring (case-insensitive)", () => {
  const items = [
    rowWithOutput("A", 37.5, 127.0, 100, "환경부"),
    rowWithOutput("B", 37.5, 127.0, 100, "한국전력공사"),
    rowWithOutput("C", 37.5, 127.0, 100, "GS칼텍스")
  ];
  const out = groupChargersByStation(items, { lat: 37.5, lng: 127.0, limit: 10, busiNm: "한국전력" });
  assert.equal(out.length, 1);
  assert.equal(out[0].statId, "B");
});

test("filter: speed + busiNm combined", () => {
  const items = [
    rowWithOutput("A", 37.5, 127.0, 100, "환경부"),
    rowWithOutput("B", 37.5, 127.0, 7, "환경부"),
    rowWithOutput("C", 37.5, 127.0, 100, "한전")
  ];
  const out = groupChargersByStation(items, { lat: 37.5, lng: 127.0, limit: 10, speed: "fast", busiNm: "환경부" });
  assert.equal(out.length, 1);
  assert.equal(out[0].statId, "A");
});
