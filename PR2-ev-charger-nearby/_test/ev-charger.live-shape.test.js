const test = require("node:test");
const assert = require("node:assert/strict");
const {
  proxyEvChargerNearest,
  isEvChargerErrorBody,
  groupChargersByStation
} = require("../packages/k-skill-proxy/src/ev-charger");

// Exact real response shape captured from the live ChargEV API
// https://apis.data.go.kr/B552584/EvCharger/getChargerInfo?dataType=JSON&zcode=11 (2026-05-20)
// NOTE: the envelope is FLAT (resultCode/items/totalCount at top level), NOT wrapped in response.header/body.
const REAL_FLAT_ENVELOPE = {
  resultMsg: "NORMAL SERVICE.",
  totalCount: 74298,
  items: {
    item: [
      {
        statNm: "낙성대동주민센터", statId: "ME174013", chgerId: "01", chgerType: "06",
        addr: "서울특별시 관악구 낙성대로4가길 5", useTime: "24시간 이용가능",
        lat: "37.476296", lng: "126.9583876", busiNm: "환경부",
        stat: "2", statUpdDt: "20260520110308", output: "50", method: "단독",
        zcode: "11", zscode: "11620", parkingFree: "Y", note: "", limitYn: "N"
      },
      {
        statNm: "서울추모공원", statId: "ME174027", chgerId: "01", chgerType: "06",
        addr: "서울특별시 서초구 양재대로12길 74", useTime: "24시간 이용가능",
        lat: "37.4536062", lng: "127.0428005", busiNm: "환경부",
        stat: "3", statUpdDt: "20260520110521", output: "50", method: "단독",
        zcode: "11", zscode: "11650", parkingFree: "N", note: "", limitYn: "N"
      },
      // station with two chargers (real: ME178009 had chgerId 01 & 02)
      {
        statNm: "서울만남(부산) 휴게소", statId: "ME178009", chgerId: "01", chgerType: "06",
        addr: "서울특별시 서초구 양재대로12길 73-71 (원지동)", useTime: "24시간 이용가능",
        lat: "37.4600218", lng: "127.0420378", busiNm: "환경부",
        stat: "2", statUpdDt: "20260520110312", output: "50", method: "단독",
        zcode: "11", zscode: "11650", parkingFree: "Y", note: "", limitYn: "N"
      },
      {
        statNm: "서울만남(부산) 휴게소", statId: "ME178009", chgerId: "02", chgerType: "06",
        addr: "서울특별시 서초구 양재대로12길 73-71 (원지동)", useTime: "24시간 이용가능",
        lat: "37.4600218", lng: "127.0420378", busiNm: "환경부",
        stat: "2", statUpdDt: "20260520110318", output: "50", method: "단독",
        zcode: "11", zscode: "11650", parkingFree: "Y", note: "", limitYn: "N"
      }
    ]
  },
  pageNo: 1,
  resultCode: "00",
  numOfRows: 10
};

test("LIVE-SHAPE: flat envelope passes error detection (resultCode 00 at top level)", () => {
  assert.equal(isEvChargerErrorBody(JSON.stringify(REAL_FLAT_ENVELOPE)), false);
});

test("LIVE-SHAPE: nearest parses flat envelope, groups multi-charger station", async () => {
  let calls = 0;
  const mockFetch = async () => {
    calls++;
    // first page returns the 4 real rows; mark as last page by returning < numOfRows
    const body = calls === 1 ? REAL_FLAT_ENVELOPE : { resultCode: "00", items: { item: [] }, totalCount: 0 };
    return {
      status: 200,
      headers: { get: () => "application/json;charset=UTF-8" },
      text: async () => JSON.stringify(body)
    };
  };

  // Query near 서울추모공원 / 서울만남 휴게소 (서초)
  const out = await proxyEvChargerNearest({
    query: { lat: 37.455, lng: 127.043, zcode: "11", limit: 5, chgerType: null, onlyAvailable: false },
    serviceKey: "REAL_KEY_PLACEHOLDER",
    fetchImpl: mockFetch
  });

  assert.equal(out.statusCode, 200);
  const parsed = JSON.parse(out.body);

  // 4 chargers scanned, but ME178009 has 2 chargers -> 3 unique stations
  assert.equal(parsed.total_chargers_scanned, 4);
  assert.equal(parsed.stations.length, 3);

  // ME178009 should be grouped with 2 chargers
  const merged = parsed.stations.find((s) => s.statId === "ME178009");
  assert.ok(merged, "ME178009 must be present");
  assert.equal(merged.chargers.length, 2);
  assert.equal(merged.availableCount, 2); // both stat=2
  assert.equal(merged.chargers[0].chgerTypeName, "DC차데모+AC3상+DC콤보");

  // 서울추모공원 has stat=3 (충전중) -> availableCount 0
  const memorial = parsed.stations.find((s) => s.statId === "ME174027");
  assert.equal(memorial.availableCount, 0);
  assert.equal(memorial.chargers[0].statName, "충전중");

  // sorted by distance ascending
  for (let i = 1; i < parsed.stations.length; i++) {
    assert.ok(parsed.stations[i].distanceMeters >= parsed.stations[i - 1].distanceMeters);
  }
});

test("LIVE-SHAPE: onlyAvailable drops the 충전중 station", async () => {
  const mockFetch = async () => ({
    status: 200,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(REAL_FLAT_ENVELOPE)
  });
  const out = await proxyEvChargerNearest({
    query: { lat: 37.455, lng: 127.043, zcode: "11", limit: 10, chgerType: null, onlyAvailable: true },
    serviceKey: "K",
    fetchImpl: mockFetch
  });
  const parsed = JSON.parse(out.body);
  // ME174027 (충전중, availableCount 0) must be excluded
  assert.ok(!parsed.stations.some((s) => s.statId === "ME174027"));
  assert.ok(parsed.stations.every((s) => s.availableCount > 0));
});
