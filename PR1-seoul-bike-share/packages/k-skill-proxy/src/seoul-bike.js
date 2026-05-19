const SEOUL_BIKE_UPSTREAM_BASE_URL = "http://openapi.seoul.go.kr:8088";
const SEOUL_BIKE_SERVICE = "bikeList";
const SEOUL_BIKE_MAX_PAGE_SIZE = 1000;
const SEOUL_BIKE_MAX_STATIONS = 4000;
const SEOUL_BIKE_DEFAULT_NEAREST_LIMIT = 5;
const SEOUL_BIKE_MAX_NEAREST_LIMIT = 50;

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function normalizeSeoulBikeInteger(value, field, { min, max }) {
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

function normalizeSeoulBikeCoordinate(value, field, { min, max }) {
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

function normalizeSeoulBikeStationsQuery(query = {}) {
  const start = normalizeSeoulBikeInteger(query.start, "start", { min: 1, max: SEOUL_BIKE_MAX_STATIONS });
  const end = normalizeSeoulBikeInteger(query.end, "end", { min: 1, max: SEOUL_BIKE_MAX_STATIONS });

  const normalizedStart = start === null ? 1 : start;
  const normalizedEnd = end === null ? Math.min(normalizedStart + SEOUL_BIKE_MAX_PAGE_SIZE - 1, SEOUL_BIKE_MAX_STATIONS) : end;

  if (normalizedEnd < normalizedStart) {
    throw new Error("Provide end >= start.");
  }
  if (normalizedEnd - normalizedStart + 1 > SEOUL_BIKE_MAX_PAGE_SIZE) {
    throw new Error(`Provide a range of at most ${SEOUL_BIKE_MAX_PAGE_SIZE} stations per request.`);
  }

  return { start: normalizedStart, end: normalizedEnd };
}

function normalizeSeoulBikeNearestQuery(query = {}) {
  const lat = normalizeSeoulBikeCoordinate(query.lat, "lat", { min: 33, max: 39 });
  const lng = normalizeSeoulBikeCoordinate(query.lng, "lng", { min: 124, max: 132 });
  const limitRaw = normalizeSeoulBikeInteger(query.limit, "limit", { min: 1, max: SEOUL_BIKE_MAX_NEAREST_LIMIT });
  const limit = limitRaw === null ? SEOUL_BIKE_DEFAULT_NEAREST_LIMIT : limitRaw;
  return { lat, lng, limit };
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

async function fetchSeoulBikePage({ serviceKey, start, end, fetchImpl = global.fetch }) {
  const url = `${SEOUL_BIKE_UPSTREAM_BASE_URL}/${encodeURIComponent(serviceKey)}/json/${SEOUL_BIKE_SERVICE}/${start}/${end}/`;
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": "k-skill-proxy/seoul-bike"
    },
    signal: AbortSignal.timeout(20000)
  });
  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}

async function proxySeoulBikeStations({ query, serviceKey, fetchImpl = global.fetch }) {
  if (!serviceKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "SEOUL_OPEN_API_KEY is not configured on the proxy server."
      })
    };
  }
  return fetchSeoulBikePage({ serviceKey, start: query.start, end: query.end, fetchImpl });
}

async function proxySeoulBikeNearest({ query, serviceKey, fetchImpl = global.fetch }) {
  if (!serviceKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "SEOUL_OPEN_API_KEY is not configured on the proxy server."
      })
    };
  }

  const pages = [];
  for (let start = 1; start <= SEOUL_BIKE_MAX_STATIONS; start += SEOUL_BIKE_MAX_PAGE_SIZE) {
    const end = Math.min(start + SEOUL_BIKE_MAX_PAGE_SIZE - 1, SEOUL_BIKE_MAX_STATIONS);
    const upstream = await fetchSeoulBikePage({ serviceKey, start, end, fetchImpl });
    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      return upstream;
    }
    let parsed;
    try {
      parsed = JSON.parse(upstream.body);
    } catch {
      return {
        statusCode: 502,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          error: "upstream_invalid_response",
          message: "Seoul bike upstream returned non-JSON.",
          upstream_status: upstream.statusCode
        })
      };
    }
    const rows = parsed?.rentBikeStatus?.row;
    if (!Array.isArray(rows) || rows.length === 0) {
      break;
    }
    pages.push(...rows);
    if (rows.length < SEOUL_BIKE_MAX_PAGE_SIZE) {
      break;
    }
  }

  const ranked = pages
    .map((row) => {
      const lat = Number.parseFloat(row.stationLatitude);
      const lng = Number.parseFloat(row.stationLongitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }
      const rackTotCnt = Number.parseInt(row.rackTotCnt, 10);
      const parkingBikeTotCnt = Number.parseInt(row.parkingBikeTotCnt, 10);
      const availableRacks =
        Number.isFinite(rackTotCnt) && Number.isFinite(parkingBikeTotCnt)
          ? Math.max(rackTotCnt - parkingBikeTotCnt, 0)
          : null;
      return {
        stationId: row.stationId ?? null,
        stationName: row.stationName ?? null,
        stationLatitude: lat,
        stationLongitude: lng,
        parkingBikeTotCnt: Number.isFinite(parkingBikeTotCnt) ? parkingBikeTotCnt : null,
        rackTotCnt: Number.isFinite(rackTotCnt) ? rackTotCnt : null,
        availableRacks,
        shared: row.shared ?? null,
        distanceMeters: Math.round(
          haversineDistanceMeters(query.lat, query.lng, lat, lng)
        )
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, query.limit);

  return {
    statusCode: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({
      rentBikeStatus: {
        list_total_count: pages.length,
        RESULT: { CODE: "INFO-000", MESSAGE: "Computed by k-skill-proxy nearest helper." },
        row: ranked
      }
    })
  };
}

function isSeoulBikeErrorBody(body) {
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
    const result = payload?.rentBikeStatus?.RESULT ?? payload?.RESULT;
    if (result && typeof result === "object") {
      const code = String(result.CODE ?? "").trim();
      return Boolean(code) && code !== "INFO-000";
    }
    return false;
  } catch {
    return true;
  }
}

module.exports = {
  SEOUL_BIKE_UPSTREAM_BASE_URL,
  SEOUL_BIKE_SERVICE,
  SEOUL_BIKE_MAX_PAGE_SIZE,
  SEOUL_BIKE_MAX_STATIONS,
  normalizeSeoulBikeStationsQuery,
  normalizeSeoulBikeNearestQuery,
  proxySeoulBikeStations,
  proxySeoulBikeNearest,
  isSeoulBikeErrorBody,
  haversineDistanceMeters
};
