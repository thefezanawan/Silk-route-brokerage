'use strict';
/**
 * Validation for the quote form. Field names are the exact labels used by the
 * frontend form (see QF in public/index.html), so the JSON body keys match.
 */
const FREIGHT_TYPES = ['Dry Van', 'Flatbed', 'Reefer', 'Oversized/Heavy Haul', 'LTL'];

const FIELDS = [
  { key: 'Full Name', id: 'name', required: true, max: 100 },
  { key: 'Company Name', id: 'company', required: true, max: 150 },
  { key: 'Email Address', id: 'email', required: true, max: 254, type: 'email' },
  { key: 'Phone Number', id: 'phone', required: true, max: 30, type: 'tel' },
  { key: 'Origin (City, State)', id: 'origin', required: true, max: 120 },
  { key: 'Destination (City, State)', id: 'destination', required: true, max: 120 },
  { key: 'Freight Type', id: 'freightType', required: true, max: 40, type: 'freight' },
  { key: 'Weight (lbs)', id: 'weight', required: true, max: 40 },
  { key: 'Dimensions (L x W x H)', id: 'dimensions', required: false, max: 80 },
  { key: 'Pickup Date', id: 'pickupDate', required: true, max: 10, type: 'date' },
  { key: 'Delivery Date (if known)', id: 'deliveryDate', required: false, max: 10, type: 'date' },
];

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const clean = (v) => String(v ?? '').replace(CONTROL, '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

const EMAIL_RE = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]{2,}$/;

// 7-15 digits in the number itself; allows + ( ) - . spaces and an optional extension ("x12", "ext. 12", "#12")
function isPhone(v) {
  const m = v.match(/^([0-9+()\-.\s]+?)(?:\s*(?:ext\.?|x|#)\s*\d{1,6})?$/i);
  if (!m) return false;
  const digits = m[1].replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
}

function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * @param {object} body  parsed JSON body
 * @param {Date} [now]   injectable clock for tests
 * @returns {{ok:boolean, errors:Object<string,string>, data:Object<string,string>}}
 */
function validateQuote(body, now = new Date()) {
  const errors = {};
  const data = {};
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};

  for (const f of FIELDS) {
    const raw = src[f.key];
    if (raw !== undefined && typeof raw !== 'string') {
      errors[f.key] = 'Invalid value';
      continue;
    }
    const v = clean(raw);
    data[f.id] = v;
    if (!v) {
      if (f.required) errors[f.key] = 'Required';
      continue;
    }
    if (v.length > f.max) { errors[f.key] = `Must be ${f.max} characters or fewer`; continue; }
    if (f.type === 'email' && !EMAIL_RE.test(v)) errors[f.key] = 'Enter a valid email address';
    else if (f.type === 'tel' && !isPhone(v)) errors[f.key] = 'Enter a valid phone number';
    else if (f.type === 'freight' && !FREIGHT_TYPES.includes(v)) errors[f.key] = 'Select a valid freight type';
    else if (f.type === 'date' && !isRealDate(v)) errors[f.key] = 'Enter a valid date';
  }

  // Cross-field date rules (1-day tolerance for timezone differences)
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  if (!errors['Pickup Date'] && data.pickupDate && data.pickupDate < yesterday) {
    errors['Pickup Date'] = "Pickup date can't be in the past";
  }
  if (!errors['Delivery Date (if known)'] && data.deliveryDate && data.pickupDate && !errors['Pickup Date'] && data.deliveryDate < data.pickupDate) {
    errors['Delivery Date (if known)'] = "Delivery date can't be before pickup";
  }

  return { ok: Object.keys(errors).length === 0, errors, data };
}

module.exports = { validateQuote, FIELDS, FREIGHT_TYPES };
