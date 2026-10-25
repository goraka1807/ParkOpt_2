export const VALID_VEHICLE_TYPES = ['motorcycle', 'compact', 'sedan', 'suv', 'van', 'truck', 'electric'];

const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]';

export function hasExplicitTimezone(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(trimmed)) {
    return false;
  }

  return Number.isFinite(Date.parse(trimmed));
}

export function parseBooleanInput(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', ''].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

export function isValidUuid(value) {
  if (typeof value !== 'string') {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export function validateSearchRequest(body = {}) {
  const errors = [];

  if (!isPlainObject(body)) {
    return {
      valid: false,
      errors: ['Request body must be a JSON object.'],
      normalized: null,
    };
  }

  const {
    lat,
    lng,
    radius_km = 5.0,
    starts_at = null,
    ends_at = null,
    vehicle_type = null,
    max_price = null,
    covered_only = false,
    ev_charging = false,
    limit = 20,
    offset = 0,
  } = body;

  if (typeof lat !== 'number' || Number.isNaN(lat) || lat < -90 || lat > 90) {
    errors.push('lat is required and must be a number between -90 and 90.');
  }

  if (typeof lng !== 'number' || Number.isNaN(lng) || lng < -180 || lng > 180) {
    errors.push('lng is required and must be a number between -180 and 180.');
  }

  const radiusValue = Number(radius_km);
  if (!Number.isFinite(radiusValue) || radiusValue <= 0 || radiusValue > 50) {
    errors.push('radius_km must be a positive number between 0 and 50.');
  }

  if ((starts_at !== null || ends_at !== null) && (!hasExplicitTimezone(starts_at) || !hasExplicitTimezone(ends_at))) {
    errors.push('If providing a time window, both starts_at and ends_at must be valid ISO 8601 timestamps with an explicit timezone.');
  }

  if (starts_at !== null && ends_at !== null && hasExplicitTimezone(starts_at) && hasExplicitTimezone(ends_at)) {
    const start = new Date(starts_at);
    const end = new Date(ends_at);
    if (start >= end) {
      errors.push('starts_at must be before ends_at.');
    }
  }

  if (vehicle_type !== null && (!VALID_VEHICLE_TYPES.includes(String(vehicle_type)))) {
    errors.push(`vehicle_type must be one of: ${VALID_VEHICLE_TYPES.join(', ')}`);
  }

  if (max_price !== null && (!Number.isFinite(Number(max_price)) || Number(max_price) <= 0)) {
    errors.push('max_price must be a positive number when provided.');
  }

  const boolFields = ['covered_only', 'ev_charging'];
  for (const key of boolFields) {
    const value = body[key];
    const presence = Object.prototype.hasOwnProperty.call(body, key);
    if (presence && typeof value !== 'boolean' && !(typeof value === 'string' && ['true', 'false', '1', '0', 'yes', 'no', 'y', 'n', ''].includes(value.trim().toLowerCase()))) {
      errors.push(`${key} must be a boolean or an accepted true/false string.`);
    }
  }

  const parsedLimit = Number(limit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    errors.push('limit must be an integer between 1 and 100.');
  }

  const parsedOffset = Number(offset);
  if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
    errors.push('offset must be a non-negative integer.');
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized: {
      lat: Number(lat),
      lng: Number(lng),
      radius_km: Number(radius_km),
      starts_at,
      ends_at,
      vehicle_type,
      max_price: max_price === null ? null : Number(max_price),
      covered_only: parseBooleanInput(covered_only, false),
      ev_charging: parseBooleanInput(ev_charging, false),
      limit: parsedLimit,
      offset: parsedOffset,
    },
  };
}

export function validateBookingRequest(body = {}) {
  const errors = [];

  if (!isPlainObject(body)) {
    return {
      valid: false,
      errors: ['Request body must be a JSON object.'],
    };
  }

  const forbiddenFields = ['driver_id', 'status', 'price_per_hour', 'total_price', 'duration_hours', 'payment_status', 'payment_id', 'cancelled_at', 'cancellation_reason', 'cancelled_by'];
  const forbiddenPresent = forbiddenFields.filter((field) => Object.prototype.hasOwnProperty.call(body, field));
  if (forbiddenPresent.length > 0) {
    errors.push(`Server-controlled fields are not allowed in the booking request: ${forbiddenPresent.join(', ')}.`);
  }

  const { space_id, starts_at, ends_at, vehicle_type, vehicle_plate, driver_notes } = body;

  if (!isValidUuid(space_id)) {
    errors.push('space_id is required and must be a valid UUID.');
  }

  if (!hasExplicitTimezone(starts_at)) {
    errors.push('starts_at must be a valid ISO 8601 timestamp with an explicit timezone.');
  }

  if (!hasExplicitTimezone(ends_at)) {
    errors.push('ends_at must be a valid ISO 8601 timestamp with an explicit timezone.');
  }

  if (hasExplicitTimezone(starts_at) && hasExplicitTimezone(ends_at)) {
    const start = new Date(starts_at);
    const end = new Date(ends_at);
    if (start >= end) {
      errors.push('ends_at must be after starts_at.');
    }
  }

  if (!vehicle_type || !VALID_VEHICLE_TYPES.includes(String(vehicle_type))) {
    errors.push(`vehicle_type must be one of: ${VALID_VEHICLE_TYPES.join(', ')}`);
  }

  if (vehicle_plate !== undefined && vehicle_plate !== null && typeof vehicle_plate !== 'string') {
    errors.push('vehicle_plate must be a string when provided.');
  }

  if (driver_notes !== undefined && driver_notes !== null && typeof driver_notes !== 'string') {
    errors.push('driver_notes must be a string when provided.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
