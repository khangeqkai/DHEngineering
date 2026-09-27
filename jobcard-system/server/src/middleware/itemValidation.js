// Part-level (line-item) array validators, split out of validation.js: every
// function here validates one field across a job's whole items array, rather
// than a single request-body field via express-validator's body()/param()
// chains, so they're called directly from route handlers instead of being
// wired into an express-validator chain.
const { splitAnswer, hasMixedNa } = require('../shared/lineItemAnswers');

// Lazy-loaded tag queries (avoids circular dependency with database.js)
let _tagQueries = null;
function getTagQueries() {
  if (!_tagQueries) {
    _tagQueries = require('../db/database').tagQueries;
  }
  return _tagQueries;
}

// Lazy-loaded supplier queries (same circular-dependency avoidance)
let _supplierQueries = null;
function getSupplierQueries() {
  if (!_supplierQueries) {
    _supplierQueries = require('../db/database').supplierQueries;
  }
  return _supplierQueries;
}

/**
 * Get allowed tag values for a category from the database
 * @param {string} category - Tag category (e.g., 'treatment', 'job_type')
 * @returns {string[]} Array of allowed values
 */
function getTagValues(category) {
  try {
    // Include archived options: a job keeps whatever value it was saved with, so
    // the save-check must still recognise a since-retired option. The pickers use
    // the active-only list separately, so retired options never get offered for new work.
    return getTagQueries().getByCategoryIncludeArchived.all(category).map(t => t.value);
  } catch (err) {
    // Fallback to empty array if DB not ready
    return [];
  }
}

// Tag-based fields (drawings, customer_property, treatment, material, job_type)
// are validated dynamically via getTagValues() from the tags DB table.

/**
 * Validate treatments array on line items.
 * Each item.treatments is an array of objects: { value, supplierId, supplierName }
 * Required: value (must be a known treatment tag value). Supplier is optional.
 *
 * `existingItems` (optional) are the treatments already saved on this job. Any
 * treatment->supplier pairing that was already saved is "grandfathered": we skip
 * the supplier-active check for it, so editing an old job whose supplier was later
 * switched off doesn't get blocked over a line the user never touched. Brand-new
 * or changed pairings are still checked. Create calls pass no existingItems.
 *
 * Returns error string or null if valid.
 */
function buildGrandfatheredPairs(existingItems) {
  const pairs = new Set();
  if (!Array.isArray(existingItems)) return pairs;
  for (const item of existingItems) {
    let treatments = item && item.treatments;
    if (typeof treatments === 'string') {
      try { treatments = JSON.parse(treatments); } catch { treatments = null; }
    }
    if (!Array.isArray(treatments)) continue;
    for (const tr of treatments) {
      if (!tr) continue;
      const value = tr.value ? String(tr.value).trim() : '';
      const supplierId = tr.supplierId ? String(tr.supplierId).trim() : '';
      if (value && supplierId) pairs.add(`${supplierId}|${value}`);
    }
  }
  return pairs;
}

// Every list-item validator names the item it's complaining about with this
// helper. The default (used by the bulk create/update routes, which validate a
// real array in on-screen order) is positional — "Part 3" genuinely is the
// third row. A caller validating a single part against a one-element array
// (jobcard-items.js) passes its own `getItemLabel` that ignores the index and
// names the part by its description instead, since position 0 in a one-element
// array tells the user nothing about which of their parts failed.
function defaultItemLabel(item, i) {
  return `Part ${i + 1}`;
}

function validateItemTreatments(items, existingItems, getItemLabel = defaultItemLabel) {
  if (!Array.isArray(items)) return null;
  const allowedTreatments = getTagValues('treatment');
  const grandfathered = buildGrandfatheredPairs(existingItems);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const label = getItemLabel(item, i);
    const treatments = item.treatments;
    if (treatments === undefined || treatments === null) continue;
    if (!Array.isArray(treatments)) {
      return `${label} treatments must be an array`;
    }
    for (let t = 0; t < treatments.length; t++) {
      const tr = treatments[t];
      if (!tr || typeof tr !== 'object') {
        return `${label} treatment ${t + 1} must be an object`;
      }
      const value = tr.value ? String(tr.value).trim() : '';
      if (!value) {
        return `${label} treatment ${t + 1} is missing a treatment value`;
      }
      if (allowedTreatments.length > 0 && !allowedTreatments.includes(value)) {
        return `${label} treatment ${t + 1} has invalid value: ${value}`;
      }
      // Supplier is optional — a treatment can be saved with none. When one is
      // given, it just has to be a real, active supplier; it no longer has to be
      // pre-linked to this treatment (a treatment added on the spot has no links).
      const supplierId = tr.supplierId ? String(tr.supplierId).trim() : '';
      if (supplierId) {
        const isGrandfathered = grandfathered.has(`${supplierId}|${value}`);
        const supplier = getSupplierQueries().getById.get(supplierId);
        if (!isGrandfathered) {
          if (!supplier) {
            return `${label} treatment ${t + 1}: selected supplier no longer exists`;
          }
          if (supplier.active !== 1) {
            return `${label} treatment ${t + 1}: selected supplier is switched off`;
          }
        }
        // The part always stores the supplier's current name from the database,
        // never whatever the client happened to send — so a rename is reflected
        // even on a pairing this save didn't otherwise touch, and a stale or
        // wrong name typed on the client can never stick. `items` is the same
        // array the caller goes on to persist, so this mutation is what gets saved.
        if (supplier) {
          tr.supplierName = supplier.name;
        }
      }
    }
  }
  return null;
}

/**
 * Collect every value a job already had saved in a given line-item column (raw DB
 * rows, snake_case). A previously-saved value is "grandfathered": it still passes
 * validation even after the option was archived or — in the rename edge case —
 * removed from the tag list entirely. With getTagValues now reading archived
 * options too, this mainly rescues that rename edge case. Splitting on comma
 * handles both single-value columns (material/job_type) and comma-joined lists.
 */
function buildGrandfatheredValues(existingItems, column) {
  const values = new Set();
  if (!Array.isArray(existingItems)) return values;
  for (const item of existingItems) {
    const raw = item && item[column];
    if (!raw) continue;
    String(raw).split(',').map(v => v.trim()).filter(Boolean).forEach(v => values.add(v));
  }
  return values;
}

/**
 * Validate material field on line items array.
 * Each item.material is a single tag value from the 'material' category.
 * `existingItems` (optional, raw DB rows) grandfather values already saved on the job.
 * Returns error string or null if valid.
 */
function validateItemMaterials(items, existingItems, getItemLabel = defaultItemLabel) {
  if (!Array.isArray(items)) return null;
  const allowedMaterials = getTagValues('material');
  const grandfathered = buildGrandfatheredValues(existingItems, 'material');
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.material) {
      const value = String(item.material).trim();
      if (value && allowedMaterials.length > 0 && !allowedMaterials.includes(value) && !grandfathered.has(value)) {
        return `${getItemLabel(item, i)} has invalid material value: ${value}`;
      }
    }
  }
  return null;
}

/**
 * Validate jobType field on line items array.
 * Each item.jobType is a single tag value from the 'job_type' category.
 * Required: every item must have a jobType.
 * `existingItems` (optional, raw DB rows) grandfather values already saved on the job.
 * Returns error string or null if valid.
 */
function validateItemJobTypes(items, existingItems, getItemLabel = defaultItemLabel) {
  if (!Array.isArray(items)) return null;
  const allowedJobTypes = getTagValues('job_type');
  const grandfathered = buildGrandfatheredValues(existingItems, 'job_type');
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const label = getItemLabel(item, i);
    const value = item.jobType ? String(item.jobType).trim() : '';
    if (!value) {
      return `${label} is missing job type`;
    }
    if (allowedJobTypes.length > 0 && !allowedJobTypes.includes(value) && !grandfathered.has(value)) {
      return `${label} has invalid job type value: ${value}`;
    }
  }
  return null;
}

/**
 * Validate a required, comma-separated, tag-backed multi-select field on each
 * line item (used for drawings and customer property). Every line must carry at
 * least one value, and every value must be a known tag in the given category.
 * The "N/A" option is itself a tag value, so picking it satisfies the requirement.
 * @param {Array} items - line items
 * @param {string} field - the camelCase item field name (e.g. 'drawingsType')
 * @param {string} category - the tag category to validate against
 * @param {string} label - human-readable label for error messages
 * @param {Array} existingItems - raw DB rows; values already saved are grandfathered
 * @param {string} column - the snake_case DB column to read grandfathered values from
 * @param {Function} [getItemLabel] - names the item in the message; defaults to positional
 * @returns {string|null} error string or null if valid
 */
function validateItemTagList(items, field, category, label, existingItems, column, getItemLabel = defaultItemLabel) {
  if (!Array.isArray(items)) return null;
  const allowed = getTagValues(category);
  const grandfathered = buildGrandfatheredValues(existingItems, column);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemLabel = getItemLabel(item, i);
    const raw = item[field];
    const values = splitAnswer(raw);
    if (values.length === 0) {
      return `${itemLabel} is missing ${label}`;
    }
    // "N/A" is the standalone "no drawing / nothing supplied" answer, so it can't
    // be combined with a real value for the same line.
    if (hasMixedNa(values)) {
      return `${itemLabel} cannot combine "N/A" with other ${label} values`;
    }
    if (allowed.length > 0) {
      const invalid = values.filter(v => !allowed.includes(v) && !grandfathered.has(v));
      if (invalid.length > 0) {
        return `${itemLabel} has invalid ${label} values: ${invalid.join(', ')}`;
      }
    }
  }
  return null;
}

function validateItemDrawings(items, existingItems, getItemLabel = defaultItemLabel) {
  return validateItemTagList(items, 'drawingsType', 'drawings', 'drawings', existingItems, 'drawings_type', getItemLabel);
}

function validateItemCustomerProperty(items, existingItems, getItemLabel = defaultItemLabel) {
  return validateItemTagList(items, 'customerProperty', 'customer_property', 'customer property', existingItems, 'customer_property', getItemLabel);
}

/**
 * Validate the quantity field on line items array.
 * Every line item must carry a quantity, and it must be a positive whole number
 * (1 or more) — no blanks, decimals, or zero. The ordered quantity drives the
 * "all parts finished -> Done" check, so a missing/fractional value would make
 * completion impossible to judge.
 * Returns error string or null if valid.
 */
function validateItemQuantities(items, getItemLabel = defaultItemLabel) {
  if (!Array.isArray(items)) return null;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const label = getItemLabel(item, i);
    const raw = item.qty;
    const str = (raw === undefined || raw === null) ? '' : String(raw).trim();
    if (!str) {
      return `${label} is missing a quantity`;
    }
    if (!/^\d+$/.test(str) || parseInt(str, 10) < 1) {
      return `${label} quantity must be a whole number of 1 or more`;
    }
  }
  return null;
}

/**
 * Validate description field on line items array.
 * The job_items.description column is NOT NULL, so every line item must carry a
 * non-empty description. The create screen already strips blank rows, but the
 * server cannot rely on that for non-standard requests.
 * Returns error string or null if valid.
 */
function validateItemDescriptions(items, getItemLabel = defaultItemLabel) {
  if (!Array.isArray(items)) return null;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const value = item.description ? String(item.description).trim() : '';
    if (!value) {
      return `${getItemLabel(item, i)} is missing a description`;
    }
  }
  return null;
}

module.exports = {
  validateItemTreatments,
  validateItemMaterials,
  validateItemJobTypes,
  validateItemDrawings,
  validateItemCustomerProperty,
  validateItemDescriptions,
  validateItemQuantities
};
