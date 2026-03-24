const { body, param, query, validationResult } = require('express-validator');

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

const JOB_TYPES = [
  'MANUFACTURE', 'REPAIR', 'MODIFY', 'FABRICATE',
  'SUPPLY', 'REVERSE ENGINEER', 'INSPECTION', 'CAD DRAWINGS',
  'CONSULTATION', 'ON-SITE'
];

const JOBCARD_STATUSES = ['QUOTE', 'OPEN', 'IN_PROGRESS', 'ON_HOLD', 'DONE', 'INVOICED'];

const PRIORITY_OPTIONS = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];

const QUALITY_LEVELS = ['STANDARD', 'CRITICAL'];

const DRAWINGS_TYPES = ['NONE', 'CUSTOMER_CAD', 'CUSTOMER_SKETCH', 'DH_CAD', 'DH_SKETCH', 'PREPARE_SKETCH', 'PREPARE_CAD'];

const CUSTOMER_PROPERTY_OPTIONS = ['NONE', 'N/A', 'MATERIAL_SUPPLIED', 'DAMAGED_WORN_SAMPLE', 'GOOD_SAMPLE', 'PART_FOR_REPAIR', 'PART_FOR_MODIFICATION'];

const TREATMENT_OPTIONS = ['NONE', 'HEAT_TREATMENT', 'PRECISION_GRINDING', 'ANODISE', 'ELECTROPLATE', 'BLASTING', 'POWDERCOAT', 'SPRAYPAINT', 'GALVANISE', 'SPECIALISED_COATING', 'OTHER'];

const SUBCONTRACT_STATUSES = ['PENDING', 'SENT', 'IN_PROGRESS', 'RECEIVED', 'COMPLETE'];

const INSPECTION_OPTIONS = ['NOT_APPLICABLE', 'OK', 'ERROR'];

/**
 * Optional comma-separated multi-value enum field validator
 * @param {string} field - Field name to validate
 * @param {string} label - Human-readable field label
 * @param {string[]} allowed - Allowed values
 */
function optionalMultiEnum(field, label, allowed) {
  return body(field)
    .customSanitizer(value => (value === '' || value === null) ? undefined : value)
    .optional()
    .custom((value) => {
      if (typeof value !== 'string') {
        throw new Error(`${label} must be a comma-separated string`);
      }
      const values = value.split(',').map(v => v.trim());
      const invalid = values.filter(v => !allowed.includes(v));
      if (invalid.length > 0) {
        throw new Error(`${label} contains invalid values: ${invalid.join(', ')}`);
      }
      return true;
    });
}

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
  requiredString('contactName', 'Contact name'),
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
  requiredString('contactName', 'Contact name'),
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
  optionalEnum('jobType', 'Job type', JOB_TYPES),
  optionalEnum('status', 'Status', JOBCARD_STATUSES),
  optionalEnum('priority', 'Priority', PRIORITY_OPTIONS),
  // qualityLevel is now validated dynamically against qa_levels table (no enum check)
  body('qualityLevel')
    .customSanitizer(value => (value === '' || value === null) ? undefined : value)
    .optional()
    .isString()
    .withMessage('Quality level must be a string'),
  optionalMultiEnum('drawingsType', 'Drawings type', DRAWINGS_TYPES),
  optionalMultiEnum('customerProperty', 'Customer property', CUSTOMER_PROPERTY_OPTIONS),
  optionalMultiEnum('treatmentRequired', 'Treatment required', TREATMENT_OPTIONS),
  handleValidationErrors
];

/**
 * Subcontract status validation
 */
const validateSubcontractStatus = [
  optionalEnum('status', 'Status', SUBCONTRACT_STATUSES),
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
  validateSubcontractStatus,
  validateTimeEntryInspection,

  JOB_TYPES,
  JOBCARD_STATUSES,
  PRIORITY_OPTIONS,
  QUALITY_LEVELS,
  DRAWINGS_TYPES,
  CUSTOMER_PROPERTY_OPTIONS,
  TREATMENT_OPTIONS,
  SUBCONTRACT_STATUSES,
  INSPECTION_OPTIONS
};
