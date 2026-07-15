const { body, param, query, validationResult } = require('express-validator');

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

/**
 * Middleware to handle validation errors
 * Returns a 400 response with clear error messages if validation fails
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map(err => err.msg);
    return res.status(400).json({
      error: 'Validation failed',
      details: messages
    });
  }
  next();
}

// =============================================================================
// Reusable Validation Chains
// =============================================================================

/**
 * Required string field validator
 * @param {string} field - Field name to validate
 * @param {string} label - Human-readable field label for error messages
 */
function requiredString(field, label) {
  return body(field)
    .exists({ checkFalsy: true })
    .withMessage(`${label} is required`)
    .isString()
    .withMessage(`${label} must be a string`)
    .trim()
    .isLength({ min: 1 })
    .withMessage(`${label} cannot be empty`);
}

/**
 * Optional email field validator
 * If provided, must be valid email format
 * @param {string} field - Field name (default: 'email')
 */
function optionalEmail(field = 'email') {
  return body(field)
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage('Email must be a valid email address')
    .normalizeEmail();
}

/**
 * Optional phone number validator
 * Basic validation - allows digits, spaces, dashes, parentheses, and plus sign
 * Must contain at least one digit
 * @param {string} field - Field name (default: 'phone')
 */
function optionalPhone(field = 'phone') {
  return body(field)
    .optional({ checkFalsy: true })
    .matches(/^(?=.*\d)[\d\s\-\(\)\+]+$/)
    .withMessage('Phone number must contain at least one digit and can only contain digits, spaces, dashes, parentheses, and plus sign')
    .isLength({ min: 6, max: 20 })
    .withMessage('Phone number must be between 6 and 20 characters');
}

/**
 * UUID parameter validator for route params
 * Validates that :id parameter is a valid UUID
 * @param {string} paramName - Parameter name (default: 'id')
 */
function uuidParam(paramName = 'id') {
  return param(paramName)
    .isUUID()
    .withMessage(`${paramName} must be a valid UUID`);
}

/**
 * Optional string field validator with length constraints
 * @param {string} field - Field name to validate
 * @param {string} label - Human-readable field label
 * @param {number} maxLength - Maximum allowed length (default: 255)
 */
function optionalString(field, label, maxLength = 255) {
  return body(field)
    .optional({ checkFalsy: true })
    .isString()
    .withMessage(`${label} must be a string`)
    .trim()
    .isLength({ max: maxLength })
    .withMessage(`${label} cannot exceed ${maxLength} characters`);
}

/**
 * Optional boolean field validator
 * @param {string} field - Field name to validate
 * @param {string} label - Human-readable field label for error messages
 */
function optionalBoolean(field, label) {
  return body(field)
    .optional()
    .isBoolean()
    .withMessage(`${label} must be a boolean`);
}

/**
 * Optional enum field validator
 * @param {string} field - Field name to validate
 * @param {string} label - Human-readable field label
 * @param {string[]} allowed - Allowed values
 */
function optionalEnum(field, label, allowed) {
  return body(field)
    .customSanitizer(value => (value === '' || value === null) ? undefined : value)
    .optional()
    .isIn(allowed)
    .withMessage(`${label} must be one of: ${allowed.join(', ')}`);
}

// =============================================================================
// Enum Values
// =============================================================================

// Tag-based fields (drawings, customer_property, treatment, material, job_type)
// are validated dynamically via getTagValues() from the tags DB table.

const JOBCARD_STATUSES = ['QUOTE', 'OPEN', 'AWAITING_MATERIAL', 'IN_PROGRESS', 'TREATMENT', 'ON_HOLD', 'DONE', 'INVOICED'];

const PRIORITY_OPTIONS = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];


const JOBCARD_COLUMN_IDS = [
  'jobNumber', 'description', 'company', 'customer', 'assignedTo',
  'status', 'priority', 'attachments', 'dueDate', 'createdAt', 'updatedAt', 'actions'
];

// The job number column is the click-through to open a job, so it can never be
// hidden — only these columns may appear in the hidden list.
const HIDEABLE_COLUMN_IDS = JOBCARD_COLUMN_IDS.filter(id => id !== 'jobNumber');

// =============================================================================
// Pre-built Validation Arrays for Common Routes
// =============================================================================

/**
 * Login validation
 * POST /auth/login
 */
const validateLogin = [
  requiredString('username', 'Username'),
  requiredString('password', 'Password'),
  handleValidationErrors
];

/**
 * Create user validation
 * POST /auth/users
 */
const validateCreateUser = [
  requiredString('username', 'Username'),
  body('password')
    .exists({ checkFalsy: true })
    .withMessage('Password is required')
    .isString()
    .matches(/^\d{4}$/)
    .withMessage('Password must be exactly 4 digits'),
  optionalEmail('email'),
  requiredString('name', 'Name').isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),
  body('role')
    .optional()
    .isIn(['admin', 'user'])
    .withMessage('Role must be either "admin" or "user"'),
  handleValidationErrors
];

/**
 * Create contact validation
 * POST /contacts
 */
const validateCreateContact = [
  optionalString('contactName', 'Contact name', 200),
  requiredString('companyName', 'Company name'),
  optionalEmail('email'),
  optionalPhone('phone'),
  optionalString('address', 'Address', 500),
  optionalString('notes', 'Notes', 1000),
  handleValidationErrors
];

/**
 * Update contact validation
 * PUT /contacts/:id
 */
const validateUpdateContact = [
  optionalString('contactName', 'Contact name', 200),
  requiredString('companyName', 'Company name'),
  optionalEmail('email'),
  optionalPhone('phone'),
  optionalString('address', 'Address', 500),
  optionalString('notes', 'Notes', 1000),
  handleValidationErrors
];

/**
 * Update user preferences validation
 * PUT /auth/me/preferences
 */
const validateUpdatePreferences = [
  body('jobcardColumnOrder')
    .optional()
    .isArray({ min: 1, max: JOBCARD_COLUMN_IDS.length })
    .withMessage(`jobcardColumnOrder must be an array of 1-${JOBCARD_COLUMN_IDS.length} column IDs`)
    .bail()
    .custom((value) => {
      const seen = new Set();
      for (const id of value) {
        if (typeof id !== 'string' || !JOBCARD_COLUMN_IDS.includes(id)) {
          throw new Error(`jobcardColumnOrder contains invalid column ID: ${id}`);
        }
        if (seen.has(id)) {
          throw new Error(`jobcardColumnOrder contains duplicate column ID: ${id}`);
        }
        seen.add(id);
      }
      return true;
    }),
  body('jobcardHiddenColumns')
    .optional()
    .isArray({ max: HIDEABLE_COLUMN_IDS.length })
    .withMessage(`jobcardHiddenColumns must be an array of up to ${HIDEABLE_COLUMN_IDS.length} column IDs`)
    .bail()
    .custom((value) => {
      const seen = new Set();
      for (const id of value) {
        if (typeof id !== 'string' || !HIDEABLE_COLUMN_IDS.includes(id)) {
          throw new Error(`jobcardHiddenColumns contains invalid column ID: ${id}`);
        }
        if (seen.has(id)) {
          throw new Error(`jobcardHiddenColumns contains duplicate column ID: ${id}`);
        }
        seen.add(id);
      }
      return true;
    }),
  handleValidationErrors
];

/**
 * Job card list query params validation
 * GET /jobcards
 */
const validateJobcardListQuery = [
  query('assigneeId')
    .optional()
    .custom((value) => {
      if (value === 'UNASSIGNED') return true;
      return /^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
    })
    .withMessage('assigneeId must be "UNASSIGNED" or a valid user ID'),
  query('status')
    .optional()
    .isString()
    .withMessage('status must be a string'),
  handleValidationErrors
];

/**
 * Job card enum field validation
 * Used for both create and update routes
 */
const validateJobcardEnums = [
  optionalEnum('status', 'Status', JOBCARD_STATUSES),
  optionalEnum('priority', 'Priority', PRIORITY_OPTIONS),
  // qualityLevel is now validated dynamically against qa_levels table (no enum check)
  body('qualityLevel')
    .customSanitizer(value => (value === '' || value === null) ? undefined : value)
    .optional()
    .isString()
    .withMessage('Quality level must be a string'),
  // drawings + customer property are now per-line-item (see validateItemDrawings /
  // validateItemCustomerProperty), so they are no longer validated at job level.
  handleValidationErrors
];

/**
 * Start timer validation
 * POST /jobcards/:id/time-entries/start
 * itemNumber is required so the timer is bound to a specific line item.
 */
const validateStartTimer = [
  body('itemNumber')
    .exists({ checkNull: true })
    .withMessage('itemNumber is required')
    .bail()
    .isInt({ min: 1 })
    .withMessage('itemNumber must be a positive integer')
    .toInt(),
  handleValidationErrors
];

// Validate the start/finish on the time-log add + edit routes.
// Guards against backwards or garbled hand-entered times poisoning the
// labour-hour totals. The Start/Stop timer's own start/stop routes are
// separate and skip this; its stop-form save and resume/cancel reuse the
// edit route and pass it (real elapsed time, or a cleared finish time).
const validateManualTimeEntry = [
  body('startTime')
    .exists({ checkNull: true })
    .withMessage('Start time is required')
    .bail()
    .custom(v => !isNaN(new Date(v).getTime()))
    .withMessage('Start time is not a valid date'),
  body('endTime')
    .optional({ nullable: true, checkFalsy: true })
    .custom(v => !isNaN(new Date(v).getTime()))
    .withMessage('Finish time is not a valid date'),
  body('endTime')
    .optional({ nullable: true, checkFalsy: true })
    .custom((v, { req }) => new Date(v).getTime() > new Date(req.body.startTime).getTime())
    .withMessage('Finish time must be after the start time'),
  handleValidationErrors
];

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

function validateItemTreatments(items, existingItems) {
  if (!Array.isArray(items)) return null;
  const allowedTreatments = getTagValues('treatment');
  const grandfathered = buildGrandfatheredPairs(existingItems);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const treatments = item.treatments;
    if (treatments === undefined || treatments === null) continue;
    if (!Array.isArray(treatments)) {
      return `Item #${i + 1} treatments must be an array`;
    }
    for (let t = 0; t < treatments.length; t++) {
      const tr = treatments[t];
      if (!tr || typeof tr !== 'object') {
        return `Item #${i + 1} treatment ${t + 1} must be an object`;
      }
      const value = tr.value ? String(tr.value).trim() : '';
      if (!value) {
        return `Item #${i + 1} treatment ${t + 1} is missing a treatment value`;
      }
      if (allowedTreatments.length > 0 && !allowedTreatments.includes(value)) {
        return `Item #${i + 1} treatment ${t + 1} has invalid value: ${value}`;
      }
      // Supplier is optional — a treatment can be saved with none. When one is
      // given, it just has to be a real, active supplier; it no longer has to be
      // pre-linked to this treatment (a treatment added on the spot has no links).
      const supplierId = tr.supplierId ? String(tr.supplierId).trim() : '';
      if (supplierId && !grandfathered.has(`${supplierId}|${value}`)) {
        const supplier = getSupplierQueries().getById.get(supplierId);
        if (!supplier) {
          return `Item #${i + 1} treatment ${t + 1}: selected supplier no longer exists`;
        }
        if (supplier.active !== 1) {
          return `Item #${i + 1} treatment ${t + 1}: selected supplier is switched off`;
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
function validateItemMaterials(items, existingItems) {
  if (!Array.isArray(items)) return null;
  const allowedMaterials = getTagValues('material');
  const grandfathered = buildGrandfatheredValues(existingItems, 'material');
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.material) {
      const value = String(item.material).trim();
      if (value && allowedMaterials.length > 0 && !allowedMaterials.includes(value) && !grandfathered.has(value)) {
        return `Item #${i + 1} has invalid material value: ${value}`;
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
function validateItemJobTypes(items, existingItems) {
  if (!Array.isArray(items)) return null;
  const allowedJobTypes = getTagValues('job_type');
  const grandfathered = buildGrandfatheredValues(existingItems, 'job_type');
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const value = item.jobType ? String(item.jobType).trim() : '';
    if (!value) {
      return `Item #${i + 1} is missing job type`;
    }
    if (allowedJobTypes.length > 0 && !allowedJobTypes.includes(value) && !grandfathered.has(value)) {
      return `Item #${i + 1} has invalid job type value: ${value}`;
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
 * @returns {string|null} error string or null if valid
 */
function validateItemTagList(items, field, category, label, existingItems, column) {
  if (!Array.isArray(items)) return null;
  const allowed = getTagValues(category);
  const grandfathered = buildGrandfatheredValues(existingItems, column);
  for (let i = 0; i < items.length; i++) {
    const raw = items[i][field];
    const values = (raw ? String(raw) : '').split(',').map(v => v.trim()).filter(Boolean);
    if (values.length === 0) {
      return `Item #${i + 1} is missing ${label}`;
    }
    // "N/A" is the standalone "no drawing / nothing supplied" answer, so it can't
    // be combined with a real value for the same line.
    if (values.includes('N_A') && values.length > 1) {
      return `Item #${i + 1} cannot combine "N/A" with other ${label} values`;
    }
    if (allowed.length > 0) {
      const invalid = values.filter(v => !allowed.includes(v) && !grandfathered.has(v));
      if (invalid.length > 0) {
        return `Item #${i + 1} has invalid ${label} values: ${invalid.join(', ')}`;
      }
    }
  }
  return null;
}

function validateItemDrawings(items, existingItems) {
  return validateItemTagList(items, 'drawingsType', 'drawings', 'drawings', existingItems, 'drawings_type');
}

function validateItemCustomerProperty(items, existingItems) {
  return validateItemTagList(items, 'customerProperty', 'customer_property', 'customer property', existingItems, 'customer_property');
}

/**
 * Validate the quantity field on line items array.
 * Every line item must carry a quantity, and it must be a positive whole number
 * (1 or more) — no blanks, decimals, or zero. The ordered quantity drives the
 * "all parts finished -> Done" check, so a missing/fractional value would make
 * completion impossible to judge.
 * Returns error string or null if valid.
 */
function validateItemQuantities(items) {
  if (!Array.isArray(items)) return null;
  for (let i = 0; i < items.length; i++) {
    const raw = items[i].qty;
    const str = (raw === undefined || raw === null) ? '' : String(raw).trim();
    if (!str) {
      return `Item #${i + 1} is missing a quantity`;
    }
    if (!/^\d+$/.test(str) || parseInt(str, 10) < 1) {
      return `Item #${i + 1} quantity must be a whole number of 1 or more`;
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
function validateItemDescriptions(items) {
  if (!Array.isArray(items)) return null;
  for (let i = 0; i < items.length; i++) {
    const value = items[i].description ? String(items[i].description).trim() : '';
    if (!value) {
      return `Item #${i + 1} is missing a description`;
    }
  }
  return null;
}

module.exports = {
  // Error handler
  handleValidationErrors,

  // Reusable validators (for building custom validation chains)
  requiredString,
  optionalEmail,
  optionalPhone,
  uuidParam,
  optionalString,
  optionalBoolean,

  // Pre-built validation arrays
  validateLogin,
  validateCreateUser,
  validateUpdatePreferences,
  validateCreateContact,
  validateUpdateContact,
  validateJobcardListQuery,
  validateJobcardEnums,
  validateStartTimer,
  validateManualTimeEntry,
  validateItemTreatments,
  validateItemMaterials,
  validateItemJobTypes,
  validateItemDrawings,
  validateItemCustomerProperty,
  validateItemDescriptions,
  validateItemQuantities,

  JOBCARD_STATUSES,
  PRIORITY_OPTIONS
};
