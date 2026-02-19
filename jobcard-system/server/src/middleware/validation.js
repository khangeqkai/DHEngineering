const { body, param, validationResult } = require('express-validator');

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
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number'),
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
  optionalString('companyName', 'Company name', 200),
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
  optionalString('companyName', 'Company name', 200),
  optionalEmail('email'),
  optionalPhone('phone'),
  optionalString('address', 'Address', 500),
  optionalString('notes', 'Notes', 1000),
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
  validateUpdateContact
};
