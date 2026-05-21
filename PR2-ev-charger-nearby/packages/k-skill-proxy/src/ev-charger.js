const { searchRegionCode } = require("./region-lookup");

const EV_CHARGER_UPSTREAM_BASE_URL = "https://apis.data.go.kr/B552584/EvCharger";
const EV_CHARGER_PAGE_SIZE = 9999;
const EV_CHARGER_MAX_PAGES = 12;
const EV_CHARGER_DEFAULT_NEAREST_LIMIT = 5;
const EV_CHARGER_MAX_NEAREST_LIMIT = 50;
// "급속" 으로 간주하는 최소 충전용량(kW). 50kW 이상이면 급속으로 본다.
const EV_CHARGER_FAST_MIN_OUTPUT_KW = 50;

// 환경부 표준 충전기 타입 코드
const EV_CHARGER_TYPE_NAMES = new Map([
  ["01", "DC차데모"],
  ["02", "AC완속"],
  ["03", "DC차데모+AC3상"],
  ["04", "DC콤보"],
  ["05", "DC차데모+DC콤보"],
  ["06", "DC차데모+AC3상+DC콤보"],
  ["07", "AC3상"],
  ["08", "DC콤보(완속)"],
  ["09", "AC3상(완속)"]
]);

// 충전기 상태 코드
const EV_CHARGER_STAT_NAMES = new Map([
  ["1", "통신이상"],
  ["2", "충전대기"],
  ["3", "충전중"],
  ["4", "운영중지"],
  ["5", "점검중"],
  ["9", "상태미확인"]
]);
const EV_CHARGER_STAT_AVAILABLE = "2";

// 시도코드 (zcode) — EV API 가 사용하는 코드 체계
const EV_CHARGER_ZCODES = new Set([
  "11", "26", "27", "28", "29", "30", "31", "36",
  "41", "42", "43", "44", "45", "46", "47", "48", "50", "51", "52"
]);

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function normalizeEvChargerCoordinate(value, field, { min, max }) {
  const raw = trimOrNull(value);
  if (raw === null) {
    throw new Error(`Provide ${field}.`);
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Provide ${field} as a decimal number.`);
  }
  if (parsed < min || parsed > max) {
    throw new Error(`Provide ${field} within [${min}, ${max}].`);
  }
  return parsed;
}

function normalizeEvChargerInteger(value, field, { min, max }) {
  const raw = trimOrNull(value);
  if (raw === null) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || String(parsed) !== raw.replace(/^\+/, "")) {
    throw new Error(`Provide ${field} as an integer.`);
  }
  if (parsed < min) {
    throw new Error(`Provide ${field} >= ${min}.`);
  }
  if (max !== undefined && parsed > max) {
    throw new Error(`Provide ${field} <= ${max}.`);
  }
  return parsed;
}

function normalizeEvChargerZcode(value) {
  const raw = trimOrNull(value);
  if (raw === null) {
    throw new Error("Provide zcode (시도코드, e.g. 11 for Seoul). Nationwide fetch is not supported.");
  }
  if (!EV_CHARGER_ZCODES.has(raw)) {
    throw new Error(`Provide a valid zcode. Got "${raw}".`);
  }
  return raw;
}

function normalizeEvChargerType(value) {
  const raw = trimOrNull(value);
  if (raw === null) {
    return null;
  }
  const padded = raw.length === 1 ? `0${raw}` : raw;
  if (!EV_CHARGER_TYPE_NAMES.has(padded)) {
    throw new Error(`Provide a valid chgerType code (01-09). Got "${raw}".`);
  }
  return padded;
}

function normalizeEvChargerBoolean(value) {
  const raw = trimOrNull(value);
  if (raw === null) {
    return false;
  }
  const lower = raw.toLowerCase();
  return lower === "true" || lower === "1" || lower === "y" || lower === "yes";
}

// zscode 는 콤마로 여러 시·군·구를 받을 수 있다 (시·도/시·군·구 경계 보정용).
// 예: "11680,11650" → 강남구 + 서초구. 최대 5개.
const EV_CHARGER_MAX_ZSCODES = 5;
function normalizeEvChargerZscodeList(value) {
  const raw = trimOrNull(value);
  if (raw === null) {
    return null;
  }
  const codes = raw.split(",").map((c) => c.trim()).filter(Boolean);
  if (codes.length > EV_CHARGER_MAX_ZSCODES) {
    throw new Error(`Provide at most ${EV_CHARGER_MAX_ZSCODES} zscode values.`);
  }
  for (const c of codes) {
    if (!/^\d{5}$/.test(c)) {
      throw new Error(`Provide each zscode as 5 digits. Got "${c}".`);
    }
  }
  return codes.length > 0 ? Array.from(new Set(codes)) : null;
}

function normalizeEvChargerSpeed(value) {
  const raw = trimOrNull(value);
  if (raw === null) {
    return null;
  }
  const lower = raw.toLowerCase();
  if (["fast", "급속", "rapid", "dc"].includes(lower)) {
    return "fast";
  }
  if (["slow", "완속", "ac"].includes(lower)) {
    return "slow";
  }
  throw new Error(`Provide speed as fast(급속) or slow(완속). Got "${raw}".`);
}

// regionHint(자연어 지역명) → { zcode, zscode } 를 기존 region-lookup 으로 해석한다.
// LAWD_CD(법정동 5자리) 가 EV API 의 zscode 와 동일 체계이고, 앞 2자리가 zcode 다.
function resolveEvChargerRegion(query) {
  const regionHint = trimOrNull(query.regionHint ?? query.region_hint);
  if (regionHint === null) {
    return null;
  }
  const matches = searchRegionCode(regionHint);
  if (matches.length === 0) {
    throw new Error(`No region matched "${regionHint}". Provide zcode/zscode directly.`);
  }
  if (matches.length > 1) {
    const names = matches.slice(0, 5).map((m) => m.name).join(", ");
    throw new Error(`Region "${regionHint}" is ambiguous (${names}). Narrow it or provide zscode directly.`);
  }
  const lawd = matches[0].lawd_cd;
  return { zcode: lawd.slice(0, 2), zscode: lawd, regionName: matches[0].name };
}

function normalizeEvChargerNearestQuery(query = {}) {
  const lat = normalizeEvChargerCoordinate(query.lat, "lat", { min: 33, max: 39 });
  const lng = normalizeEvChargerCoordinate(query.lng, "lng", { min: 124, max: 132 });

  const resolved = resolveEvChargerRegion(query);
  let zcode;
  let zscodes = null;
  let regionName = null;
  if (resolved) {
    if (!EV_CHARGER_ZCODES.has(resolved.zcode)) {
      throw new Error(`Resolved zcode "${resolved.zcode}" is not a valid 시도코드.`);
    }
    zcode = resolved.zcode;
    zscodes = [resolved.zscode];
    regionName = resolved.regionName;
  } else {
    zscodes = normalizeEvChargerZscodeList(query.zscode);
    // zcode 가 직접 주어지면 검증, 없으면 zscodes 의 앞 2자리에서 유도
    const zcodeRaw = trimOrNull(query.zcode);
    if (zcodeRaw !== null) {
      zcode = normalizeEvChargerZcode(zcodeRaw);
    } else if (zscodes) {
      zcode = zscodes[0].slice(0, 2);
      if (!EV_CHARGER_ZCODES.has(zcode)) {
        throw new Error(`Derived zcode "${zcode}" from zscode is not a valid 시도코드.`);
      }
    } else {
      // 둘 다 없으면 기존 에러 메시지 유지
      zcode = normalizeEvChargerZcode(query.zcode);
    }
  }

  const limitRaw = normalizeEvChargerInteger(query.limit, "limit", { min: 1, max: EV_CHARGER_MAX_NEAREST_LIMIT });
  const limit = limitRaw === null ? EV_CHARGER_DEFAULT_NEAREST_LIMIT : limitRaw;
  const chgerType = normalizeEvChargerType(query.chgerType ?? query.charger_type);
  const speed = normalizeEvChargerSpeed(query.speed);
  const busiNm = trimOrNull(query.busiNm ?? query.busi_nm);
  const onlyAvailable = normalizeEvChargerBoolean(query.onlyAvailable ?? query.only_available);
  return { lat, lng, zcode, zscodes, regionName, limit, chgerType, speed, busiNm, onlyAvailable };
}

function normalizeEvChargerStatusQuery(query = {}) {
  const statId = trimOrNull(query.statId ?? query.stat_id);
  if (statId === null) {
    throw new Error("Provide statId.");
  }
  if (!/^[A-Za-z0-9-]{1,32}$/.test(statId)) {
    throw new Error("Provide statId as an alphanumeric station id.");
  }
  return { statId };
}

function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ChargEV returns a flat top-level envelope ({ resultCode, items: { item }, totalCount }),
// not the nested response.header/response.body shape used by some other data.go.kr APIs.
// Support both shapes defensively.
function extractItems(parsed) {
  const body = parsed?.response?.body ?? parsed;
  const item = body?.items?.item;
  if (Array.isArray(item)) {
    return item;
  }
  if (item && typeof item === "object") {
    return [item];
  }
  return [];
}

function getResultCode(parsed) {
  const code = parsed?.response?.header?.resultCode ?? parsed?.resultCode;
  return String(code ?? "").trim();
}

function getResultMsg(parsed) {
  return parsed?.response?.header?.resultMsg ?? parsed?.resultMsg ?? null;
}

function getTotalCount(parsed) {
  return Number.parseInt(parsed?.response?.body?.totalCount ?? parsed?.totalCount, 10);
}

async function fetchEvChargerPage({ serviceKey, params, fetchImpl = global.fetch }) {
  const url = new URL(`${EV_CHARGER_UPSTREAM_BASE_URL}/getChargerInfo`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("dataType", "JSON");
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": "k-skill-proxy/ev-charger"
    },
    signal: AbortSignal.timeout(20000)
  });
  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}

function notConfigured() {
  return {
    statusCode: 503,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({
      error: "upstream_not_configured",
      message: "DATA_GO_KR_API_KEY is not configured on the proxy server."
    })
  };
}

function chargerOutputKw(row) {
  const kw = Number.parseFloat(row.output);
  return Number.isFinite(kw) ? kw : null;
}

function groupChargersByStation(items, query) {
  const stations = new Map();
  const busiNeedle = query.busiNm ? query.busiNm.toLowerCase() : null;
  for (const row of items) {
    if (query.chgerType && row.chgerType !== query.chgerType) {
      continue;
    }
    if (query.speed) {
      const kw = chargerOutputKw(row);
      if (kw === null) {
        continue;
      }
      if (query.speed === "fast" && kw < EV_CHARGER_FAST_MIN_OUTPUT_KW) {
        continue;
      }
      if (query.speed === "slow" && kw >= EV_CHARGER_FAST_MIN_OUTPUT_KW) {
        continue;
      }
    }
    if (busiNeedle && !String(row.busiNm ?? "").toLowerCase().includes(busiNeedle)) {
      continue;
    }
    const lat = Number.parseFloat(row.lat);
    const lng = Number.parseFloat(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }
    const statId = row.statId ?? `${row.statNm}@${row.lat},${row.lng}`;
    if (!stations.has(statId)) {
      stations.set(statId, {
        statId: row.statId ?? null,
        statNm: row.statNm ?? null,
        addr: row.addr ?? null,
        lat,
        lng,
        busiNm: row.busiNm ?? null,
        useTime: row.useTime ?? null,
        parkingFree: row.parkingFree ?? null,
        note: row.note ?? null,
        distanceMeters: Math.round(haversineDistanceMeters(query.lat, query.lng, lat, lng)),
        chargers: []
      });
    }
    const stat = String(row.stat ?? "").trim();
    stations.get(statId).chargers.push({
      chgerId: row.chgerId ?? null,
      chgerType: row.chgerType ?? null,
      chgerTypeName: EV_CHARGER_TYPE_NAMES.get(row.chgerType) ?? null,
      stat,
      statName: EV_CHARGER_STAT_NAMES.get(stat) ?? null,
      statUpdDt: row.statUpdDt ?? null,
      output: row.output ?? null
    });
  }

  let list = Array.from(stations.values()).map((station) => ({
    ...station,
    availableCount: station.chargers.filter((c) => c.stat === EV_CHARGER_STAT_AVAILABLE).length
  }));

  if (query.onlyAvailable) {
    list = list.filter((station) => station.availableCount > 0);
  }

  return list
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, query.limit);
}

// 한 scope(특정 zscode 또는 zcode 전체)를 페이지 단위로 수집한다.
// 반환: { error } 또는 { items, truncated }
async function fetchEvChargerScope({ serviceKey, zcode, zscode, fetchImpl }) {
  const items = [];
  let truncated = false;
  for (let pageNo = 1; pageNo <= EV_CHARGER_MAX_PAGES; pageNo += 1) {
    const upstream = await fetchEvChargerPage({
      serviceKey,
      params: { pageNo, numOfRows: EV_CHARGER_PAGE_SIZE, zcode, zscode },
      fetchImpl
    });
    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      return { error: upstream };
    }
    let parsed;
    try {
      parsed = JSON.parse(upstream.body);
    } catch {
      return {
        error: {
          statusCode: 502,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({
            error: "upstream_invalid_response",
            message: "EV charger upstream returned non-JSON.",
            upstream_status: upstream.statusCode,
            upstream_body: upstream.body.slice(0, 500)
          })
        }
      };
    }
    const resultCode = getResultCode(parsed);
    if (resultCode && resultCode !== "00") {
      return {
        error: {
          statusCode: 502,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({
            error: "upstream_error",
            resultCode,
            resultMsg: getResultMsg(parsed)
          })
        }
      };
    }
    const pageItems = extractItems(parsed);
    items.push(...pageItems);
    const totalCount = getTotalCount(parsed);
    if (pageItems.length === 0) {
      break;
    }
    if (Number.isFinite(totalCount) && items.length >= totalCount) {
      break;
    }
    if (pageNo === EV_CHARGER_MAX_PAGES && Number.isFinite(totalCount) && items.length < totalCount) {
      truncated = true;
    }
  }
  return { items, truncated };
}

async function proxyEvChargerNearest({ query, serviceKey, fetchImpl = global.fetch }) {
  if (!serviceKey) {
    return notConfigured();
  }

  // 조회 scope 결정: zscodes 가 있으면 각 시·군·구를, 없으면 zcode(시·도) 전체를 본다.
  const scopes = query.zscodes && query.zscodes.length > 0
    ? query.zscodes.map((zscode) => ({ zcode: query.zcode, zscode }))
    : [{ zcode: query.zcode, zscode: undefined }];

  const items = [];
  let truncated = false;
  for (const scope of scopes) {
    const result = await fetchEvChargerScope({ serviceKey, zcode: scope.zcode, zscode: scope.zscode, fetchImpl });
    if (result.error) {
      return result.error;
    }
    items.push(...result.items);
    truncated = truncated || result.truncated;
  }

  const stations = groupChargersByStation(items, query);

  const payload = {
    zcode: query.zcode,
    zscode: query.zscodes ? query.zscodes.join(",") : null,
    regionName: query.regionName ?? null,
    total_chargers_scanned: items.length,
    truncated,
    stations
  };
  if (truncated) {
    payload.notice = "시·도(zcode) 전체를 다 조회하지 못해 일부만 스캔했습니다. 더 정확한 결과를 원하면 zscode(시·군·구) 또는 regionHint로 범위를 좁혀 다시 조회하세요.";
  }

  return {
    statusCode: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload)
  };
}

async function proxyEvChargerStatus({ query, serviceKey, fetchImpl = global.fetch }) {
  if (!serviceKey) {
    return notConfigured();
  }
  return fetchEvChargerPage({
    serviceKey,
    params: { pageNo: 1, numOfRows: 99, statId: query.statId },
    fetchImpl
  });
}

function isEvChargerErrorBody(body) {
  const text = String(body || "").trim();
  if (!text) {
    return true;
  }
  if (!(text.startsWith("{") || text.startsWith("["))) {
    return true;
  }
  try {
    const payload = JSON.parse(text);
    if (!payload || typeof payload !== "object") {
      return true;
    }
    if (payload.error) {
      return true;
    }
    const resultCode = getResultCode(payload);
    if (resultCode) {
      return resultCode !== "00";
    }
    return false;
  } catch {
    return true;
  }
}

module.exports = {
  EV_CHARGER_UPSTREAM_BASE_URL,
  EV_CHARGER_TYPE_NAMES,
  EV_CHARGER_STAT_NAMES,
  EV_CHARGER_ZCODES,
  normalizeEvChargerNearestQuery,
  normalizeEvChargerStatusQuery,
  normalizeEvChargerSpeed,
  resolveEvChargerRegion,
  proxyEvChargerNearest,
  proxyEvChargerStatus,
  isEvChargerErrorBody,
  groupChargersByStation,
  haversineDistanceMeters
};
