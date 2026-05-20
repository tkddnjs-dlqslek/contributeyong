const test = require("node:test");
const assert = require("node:assert/strict");
const {
  proxySeoulBikeNearest,
  isSeoulBikeErrorBody
} = require("../packages/k-skill-proxy/src/seoul-bike");

// Exact real response captured from the live Seoul Open Data API
// http://openapi.seoul.go.kr:8088/{KEY}/json/bikeList/1/2/  (2026-05-20)
const REAL_RESPONSE = {
  rentBikeStatus: {
    list_total_count: 2,
    RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다." },
    row: [
      {
        rackTotCnt: "15",
        stationName: "102. 망원역 1번출구 앞",
        parkingBikeTotCnt: "1",
        shared: "7",
        stationLatitude: "37.55564880",
        stationLongitude: "126.91062927",
        stationId: "ST-4"
      },
      {
        rackTotCnt: "14",
        stationName: "103. 망원역 2번출구 앞",
        parkingBikeTotCnt: "11",
        shared: "79",
        stationLatitude: "37.55495071",
        stationLongitude: "126.91083527",
        stationId: "ST-5"
      }
    ]
  }
};

test("LIVE-SHAPE: real Seoul API body passes error detection (INFO-000)", () => {
  assert.equal(isSeoulBikeErrorBody(JSON.stringify(REAL_RESPONSE)), false);
});

test("LIVE-SHAPE: nearest ranks real 망원역 stations and computes availableRacks", async () => {
  // First page returns the 2 real rows; second page empty -> loop stops.
  let calls = 0;
  const mockFetch = async () => {
    calls++;
    const body = calls === 1
      ? REAL_RESPONSE
      : { rentBikeStatus: { row: [] } };
    return {
      status: 200,
      headers: { get: () => "application/json;charset=UTF-8" },
      text: async () => JSON.stringify(body)
    };
  };

  // Query right next to 망원역 1번출구 (ST-4)
  const out = await proxySeoulBikeNearest({
    query: { lat: 37.55565, lng: 126.91063, limit: 5 },
    serviceKey: "REAL_KEY_PLACEHOLDER",
    fetchImpl: mockFetch
  });

  assert.equal(out.statusCode, 200);
  const parsed = JSON.parse(out.body);
  const rows = parsed.rentBikeStatus.row;

  assert.equal(rows.length, 2);

  // ST-4 is essentially at the query point -> closest
  assert.equal(rows[0].stationId, "ST-4");
  assert.equal(rows[0].stationName, "102. 망원역 1번출구 앞");
  assert.ok(rows[0].distanceMeters < 5, `ST-4 should be <5m, got ${rows[0].distanceMeters}`);
  // availableRacks = rackTotCnt(15) - parkingBikeTotCnt(1) = 14
  assert.equal(rows[0].parkingBikeTotCnt, 1);
  assert.equal(rows[0].rackTotCnt, 15);
  assert.equal(rows[0].availableRacks, 14);

  // ST-5 a bit further (~78m south)
  assert.equal(rows[1].stationId, "ST-5");
  assert.ok(rows[1].distanceMeters > rows[0].distanceMeters);
  // availableRacks = 14 - 11 = 3
  assert.equal(rows[1].availableRacks, 3);

  // numeric coords parsed from strings
  assert.equal(typeof rows[0].stationLatitude, "number");
  assert.equal(rows[0].stationLatitude, 37.5556488);
});
