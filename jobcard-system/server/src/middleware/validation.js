const { body, param, query, validationResult } = require('express-validator');

// Lazy-loaded tag queries (avoids circular dependency with database.js)
let _tagQueries = null;
function getTagQueries() {
  if (!_tagQueries) {
    _tagQueries = require('../db/database').tagQueries;
  }
  return _tagQueries;
}

/**
 * Get allowed tag values for a category from the database
 * @param {string} category - Tag category (e.g., 'treatment', 'job_type')
 * @returns {string[]} Array of allowed values
 */
function getTagValues(category) {
  try {
    return getTagQueries().getByCategory.all(category).map(t => t.value);
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

const INSPECTION_OPTIONS = ['NOT_APPLICABLE', 'OK', 'ERROR'];

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
  optionalString('name', 'Name', 100),
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
 * Job card list query params validation
 * GET /jobcards
 */
const validateJobcardListQuery = [
  query('assigneeId')
    .optional()
    .custom((value) => {
      if (value === 'UNASSIGNED') return true;
      return /^user:[0-9a-f-]+$/.test(value);
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
  // Drawings type validated dynamically against tags table
  body('drawingsType')
    .customSanitizer(value => (value === '' || value === null) ? undefined : value)
    .optional()
    .custom((value) => {
      if (typeof value !== 'string') {
        throw new Error('Drawings type must be a comma-separated string');
      }
      const allowed = getTagValues('drawings');
      if (allowed.length > 0) {
        const values = value.split(',').map(v => v.trim());
        const invalid = values.filter(v => v && !allowed.includes(v));
        if (invalid.length > 0) {
          throw new Error(`Drawings type contains invalid values: ${invalid.join(', ')}`);
        }
      }
      return true;
    }),
  // Customer property validated dynamically against tags table
  body('customerProperty')
    .customSanitizer(value => (value === '' || value === null) ? undefined : value)
    .optional()
    .custom((value) => {
      if (typeof value !== 'string') {
        throw new Error('Customer property must be a comma-separated string');
      }
      const allowed = getTagValues('customer_property');
      if (allowed.length > 0) {
        const values = value.split(',').map(v => v.trim());
        const invalid = values.filter(v => v && !allowed.includes(v));
        if (invalid.length > 0) {
          throw new Error(`Customer property contains invalid values: ${invalid.join(', ')}`);
        }
      }
      return true;
    }),
  handleValidationErrors
];

/**
 * Time entry inspection field validation
 */
const validateTimeEntryInspection = [
  optionalEnum('firstOffInspection', 'First off inspection', INSPECTION_OPTIONS),
  optionalEnum('inProcessValidation', 'In-process validation', INSPECTION_OPTIONS),
  handleValidationErrors
];

/**
 * Validate treatments array on line items.
 * Each item.treatments is an array of objects: { value, otherText, supplierId, supplierName }
 * Required: value (must be a known treatment tag value, or 'OTHER' with otherText) and supplierId.
 * Returns error string or null if valid.
 */
function validateItemTreatments(items) {
  if (!Array.isArray(items)) return null;
  const allowedTreatments = getTagValues('treatment');
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
      if (value === 'OTHER') {
        const otherText = tr.otherText ? String(tr.otherText).trim() : '';
        if (!otherText) {
          return `Item #${i + 1} treatment ${t + 1} (OTHER) requires text`;
        }
        if (otherText.length > 255) {
          return `Item #${i + 1} treatment ${t + 1} otherText exceeds 255 characters`;
        }
      } else if (allowedTreatments.length > 0 && !allowedTreatments.includes(value)) {
        return `Item #${i + 1} treatment ${t + 1} has invalid value: ${value}`;
      }
      const supplierId = tr.supplierId ? String(tr.supplierId).trim() : '';
      if (!supplierId) {
        return `Item #${i + 1} treatment ${t + 1} is missing a supplier`;
      }
    }
  }
  return null;
}

/**
 * Validate material field on line items array.
 * Each item.material is a single tag value from the 'material' category.
 * Returns error string or null if valid.
 */
function validateItemMaterials(items) {
  if (!Array.isArray(items)) return null;
  const allowedMaterials = getTagValues('material');
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.material) {
      const value = String(item.material).trim();
      if (value && allowedMaterials.length > 0 && !allowedMaterials.includes(value)) {
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
 * Returns error string or null if valid.
 */
function validateItemJobTypes(items) {
  if (!Array.isArray(items)) return null;
  const allowedJobTypes = getTagValues('job_type');
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const value = item.jobType ? String(item.jobType).trim() : '';
    if (!value) {
      return `Item #${i + 1} is missing job type`;
    }
    if (allowedJobTypes.length > 0 && !allowedJobTypes.includes(value)) {
      return `Item #${i + 1} has invalid job type value: ${value}`;
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
  validateCreateContact,
  validateUpdateContact,
  validateJobcardListQuery,
  validateJobcardEnums,
  validateTimeEntryInspection,
  validateItemTreatments,
  validateItemMaterials,
  validateItemJobTypes,

  JOBCARD_STATUSES,
  PRIORITY_OPTIONS,
  INSPECTION_OPTIONS
};
