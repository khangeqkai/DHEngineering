const { body, query, validationResult } = require('express-validator');
const jobStatuses = require('../shared/jobStatuses.json');
const { ALL_ROLES } = require('./auth');
const { isCalendarDate } = require('../shared/calendarDate');
// The cap on a customer's name.
const { NAME_MAX } = require('../shared/names');
// The PIN rule ("exactly 4 numeric digits") and its wording, read from the one
// shared copy — routes/auth.js's own inline password checks (update user,
// change own password) import PIN_REGEX/PIN_MESSAGE from here, and the client
// (client/src/utils/formatters.js) reads the same shared file directly.
const { PIN_REGEX, PIN_MESSAGE } = require('../shared/pin');
// A machine number may not hold the separator the stored list of logged machines is
// split on — read from the one shared copy of that split.
const { hasMachineSeparator, MACHINE_SEPARATOR_MESSAGE } = require('../shared/machineList');
const { QUALITY_LEVELS } = require('../shared/qualityLevels');

/**
 * Middleware to handle validation errors
 * Returns a 400 response with clear error messages if validation fails
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errArray = errors.array();
    const messages = errArray.map(err => err.msg);
    return res.status(400).json({
      error: 'Validation failed',
      details: messages,
      // Which field each message belongs to, so a screen can mark the box itself
      // instead of only popping up the message. express-validator 7 names it
      // `path` (an older major would call it `param`) — use whichever exists.
      fields: errArray.map(err => ({ field: err.path !== undefined ? err.path : err.param, message: err.msg }))
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
 * Name-length cap (NAME_MAX) for customers, reported as a
 * field error on the name box. Only what is sent is checked: on an edit, a name identical to the stored one
 * passes even if it is longer (an older record re-saved without touching its
 * name), so a record saved before the cap still edits.
 * @param {string} field - Field name
 * @param {string} label - Human-readable label
 * @param {(req) => string|undefined} [storedNameOf] - the record's current name, on an edit
 */
function nameLength(field, label, storedNameOf) {
  return body(field)
    .custom((value, { req }) => {
      if (typeof value !== 'string' || value.trim().length <= NAME_MAX) return true;
      const stored = storedNameOf ? storedNameOf(req) : undefined;
      return typeof stored === 'string' && stored.trim() === value.trim();
    })
    .withMessage(`${label} cannot exceed ${NAME_MAX} characters`);
}

// Looked up lazily so this file doesn't load the database just by being required.
const storedCompanyName = (req) => require('../db/database').companyQueries.getById.get(req.params.id)?.name;

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
    // Lowercase only. normalizeEmail() rewrites the address itself (it strips
    // dots and +tags from gmail.com), so jane.doe+dh@gmail.com was saved as
    // janedoe@gmail.com while the job card kept what was actually typed.
    .toLowerCase();
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

// Status/priority values come from the one shared jobStatuses.json (also read by
// the client — see client/src/components/jobcard/constants.js) so the two never
// drift apart.
const JOBCARD_STATUSES = jobStatuses.statuses.map(s => s.value);

const PRIORITY_OPTIONS = jobStatuses.priorities.map(p => p.value);


// Mirrors DEFAULT_COLUMN_ORDER in client/src/components/JobCardList.constants.js —
// a column added there must be added here too, or saving a reordered/hidden
// column list fails validation for every user.
const JOBCARD_COLUMN_IDS = [
  'jobNumber', 'description', 'company', 'customer', 'assignedTo',
  'status', 'latestNote', 'priority', 'attachments', 'print', 'dueDate', 'createdAt', 'updatedAt', 'actions'
];

// The job number column is the click-through to open a job, so it can never be
// hidden — only these columns may appear in the hidden list.
const HIDEABLE_COLUMN_IDS = JOBCARD_COLUMN_IDS.filter(id => id !== 'jobNumber');

// =============================================================================
// Pre-built Validation Arrays for Common Routes
// =============================================================================

// The longest username an account can have — the same cap on creating an account
// and on the sign-in box, so every real username still fits the sign-in check.
const USERNAME_MAX_LENGTH = 100;

/**
 * Login validation
 * POST /auth/login
 */
// Sign-in is the one write anyone can reach before signing in (every failure is
// logged and written to the activity trail with the typed username), so every box
// carries a size cap and an oversize value is refused here, before the throttle,
// the trail or the log are touched. The home access code's cap matches the most
// it can ever be (72 bytes, the most bcrypt reads — see settings-home-access.js).
const validateLogin = [
  requiredString('username', 'Username')
    .isLength({ max: USERNAME_MAX_LENGTH }).withMessage(`Username cannot exceed ${USERNAME_MAX_LENGTH} characters`),
  requiredString('password', 'Password')
    .isLength({ max: 64 }).withMessage('Password cannot exceed 64 characters'),
  body('homeAccessCode')
    .optional()
    .isString().withMessage('Home access code must be a string')
    .isLength({ max: 72 }).withMessage('Home access code cannot exceed 72 characters'),
  handleValidationErrors
];

/**
 * Create user validation
 * POST /auth/users
 */
const validateCreateUser = [
  requiredString('username', 'Username')
    .isLength({ max: USERNAME_MAX_LENGTH }).withMessage(`Username cannot exceed ${USERNAME_MAX_LENGTH} characters`),
  body('password')
    .exists({ checkFalsy: true })
    .withMessage('Password is required')
    .isString()
    .matches(PIN_REGEX)
    .withMessage(PIN_MESSAGE),
  optionalEmail('email'),
  requiredString('name', 'Name').isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),
  body('role')
    .optional()
    .isIn(ALL_ROLES)
    .withMessage('Role must be "admin", "manager" or "user"'),
  handleValidationErrors
];

// PUT /auth/users/:id — same field shape as create, but every field is optional
// since an update may touch just one of them (password's own 4-digit check and
// role's own enum check already live inline in the route).
const validateUpdateUser = [
  optionalString('name', 'Name', 100),
  optionalEmail('email'),
  handleValidationErrors
];

// POST /companies — a customer is just its name (plus optional address/notes).
const validateCreateCompany = [
  requiredString('name', 'Company name'),
  nameLength('name', 'Company name'),
  optionalString('address', 'Address', 500),
  optionalString('notes', 'Notes', 1000),
  handleValidationErrors
];

// PUT /companies/:id
const validateUpdateCompany = [
  requiredString('name', 'Company name'),
  nameLength('name', 'Company name', storedCompanyName),
  optionalString('address', 'Address', 500),
  optionalString('notes', 'Notes', 1000),
  handleValidationErrors
];

// POST /contacts — a person always belongs to a company.
const validateCreateContact = [
  requiredString('companyId', 'Company'),
  optionalString('contactName', 'Contact name', 200),
  optionalEmail('email'),
  optionalPhone('phone'),
  handleValidationErrors
];

// PUT /contacts/:id — which company a person belongs to never changes.
const validateUpdateContact = [
  optionalString('contactName', 'Contact name', 200),
  optionalEmail('email'),
  optionalPhone('phone'),
  handleValidationErrors
];

// POST /suppliers — a supplier is its name (required, non-blank) plus optional
// contact details. Mirrors validateCreateContact.
const validateCreateSupplier = [
  requiredString('name', 'Supplier name'),
  optionalEmail('contactEmail'),
  optionalPhone('contactPhone'),
  handleValidationErrors
];

// PUT /suppliers/:id
const validateUpdateSupplier = [
  requiredString('name', 'Supplier name'),
  optionalEmail('contactEmail'),
  optionalPhone('contactPhone'),
  handleValidationErrors
];

// POST /machines — a machine is its number (required, non-blank, and free of the
// comma that separates machines in logged work — otherwise "CNC,01" reads back as
// two machines); name and description are optional free text, unvalidated here (as
// before). Mirrors validateCreateSupplier.
function machineNumberRule() {
  return requiredString('machineNumber', 'Machine number')
    .custom((value) => !hasMachineSeparator(value))
    .withMessage(MACHINE_SEPARATOR_MESSAGE);
}

const validateCreateMachine = [
  machineNumberRule(),
  handleValidationErrors
];

// PUT /machines/:id
const validateUpdateMachine = [
  machineNumberRule(),
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
// A job must have a description — the same rule every line already carries. Sent as
// two pieces because create and update need different things from it: creating
// requires the field, while an update may leave it out entirely (an absent field
// means "leave this alone"). What neither may do is send a blank one, because that
// would strip a required value. The job screen marks the box and sends nothing at
// all instead, so these are the backstop for anything that isn't that screen — the
// rule used to live only on the screen, which is the weaker of the two places.
const nonBlankDescription = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Job description is required');
  }
  return true;
};

// Create: the field has to be there, and has to say something.
const validateJobcardDescriptionRequired = body('description').custom(nonBlankDescription);

const validateJobcardEnums = [
  // Update: optional, but blank is refused if it is sent. `.optional()` skips an
  // absent field only — an explicit null still reaches the check and is refused,
  // which is right, since null is not a description either.
  body('description').optional().custom(nonBlankDescription),
  optionalEnum('status', 'Status', JOBCARD_STATUSES),
  optionalEnum('priority', 'Priority', PRIORITY_OPTIONS),
  optionalEnum('qualityLevel', 'Quality level', QUALITY_LEVELS),
  // drawings + customer property are now per-line-item (see validateItemDrawings /
  // validateItemCustomerProperty), so they are no longer validated at job level.
  handleValidationErrors
];

// Due date is a bare calendar day, never a moment — must be null, '' (cleared) or
// a real 'YYYY-MM-DD'. Used on both create and update; nothing else writes due_date
// (see jobcard-mutations.js POST '/' and PUT '/:id').
const validateJobcardDueDate = body('dueDate')
  .custom(value => {
    if (value === undefined || value === null || value === '') return true;
    if (typeof value === 'string' && isCalendarDate(value)) return true;
    throw new Error('Due date must be a real calendar day (YYYY-MM-DD)');
  });

// POST /jobcards only — a new job may carry a typed-in contact name/phone/email
// (the person hasn't been saved as a real contact yet). Mirrors validateCreateContact's
// checks for the same three fields. Never applied to PUT — an existing job's
// contact fields are not editable that way.
//
// Picking a saved person copies their stored phone/email as-is, no re-check (see
// jobcard-mutations.js) — this chain only ever checks whatever the body actually
// carries, i.e. what was typed for this job.
const validateJobcardContactFields = [
  optionalString('contactName', 'Contact name', 200),
  optionalEmail('contactEmail'),
  optionalPhone('contactPhone'),
  handleValidationErrors
];

/**
 * Start timer validation
 * POST /jobcards/:id/time-entries/start
 * itemId (the part's permanent id) is required so the timer is bound to a
 * specific line item — never its item_number, which is only a sort order the
 * server owns and may have gaps.
 */
const validateStartTimer = [
  body('itemId')
    .exists({ checkNull: true })
    .withMessage('itemId is required')
    .bail()
    .isString()
    .withMessage('itemId must be a string')
    .trim()
    .notEmpty()
    .withMessage('itemId is required'),
  // Optional: an admin may start the timer for another worker. Light guard only —
  // the route validates the worker exists and is active via resolveWorkerId.
  body('workerId')
    .optional({ checkFalsy: true })
    .isString()
    .withMessage('workerId must be a string'),
  handleValidationErrors
];

// Validate the start/finish on the time-log add + edit routes.
// Guards against backwards or garbled hand-entered times poisoning the
// labour-hour totals. The Start/Stop timer's own start/stop routes are
// separate and skip this; its stop-form save and resume/cancel reuse the
// edit route and pass it (real elapsed time, or a cleared finish time).
// A hand-entered/edited block's good-piece and scrap counts must be plain
// non-negative whole numbers — "-3", "2.5" and "3 pcs" are all rejected here
// instead of being silently coerced by the route. Blank/absent is left alone
// (the route treats that as "nothing recorded" / 0).
const wholeNonNegative = (value) => {
  if (value === undefined || value === null || value === '') return true;
  if (!/^\d+$/.test(String(value).trim())) {
    throw new Error('Must be a whole number, 0 or more');
  }
  return true;
};

const validateManualTimeEntry = [
  body('startTime')
    .exists({ checkNull: true })
    .withMessage('Start time is required')
    .bail()
    .custom(v => !isNaN(new Date(v).getTime()))
    .withMessage('Start time is not a valid date'),
  // The form fills its start box from the office PC's own clock, which can run
  // several minutes ahead of this one, so up to 15 minutes ahead is taken as
  // "now". Further than that is a mistyped hour or day, not clock drift. A Stop
  // on a block that still starts ahead of the clock is discarded as a tap (see
  // startTimerUndo.js), so the leeway can never produce a negative block.
  body('startTime')
    .custom(v => new Date(v).getTime() <= Date.now() + 15 * 60 * 1000)
    .withMessage('Start time cannot be in the future'),
  body('endTime')
    .optional({ nullable: true, checkFalsy: true })
    .custom(v => !isNaN(new Date(v).getTime()))
    .withMessage('Finish time is not a valid date'),
  body('endTime')
    .optional({ nullable: true, checkFalsy: true })
    .custom((v, { req }) => new Date(v).getTime() > new Date(req.body.startTime).getTime())
    .withMessage('Finish time must be after the start time'),
  // Same leeway as the start: a finish further ahead than clock drift is a mistyped
  // hour or day, and would be billed and counted toward Done straight away. The
  // stop form never trips this — its finish is the real stop time the server stored.
  body('endTime')
    .optional({ nullable: true, checkFalsy: true })
    .custom(v => new Date(v).getTime() <= Date.now() + 15 * 60 * 1000)
    .withMessage('Finish time cannot be in the future'),
  body('qty').custom(wholeNonNegative).withMessage('Good pieces must be a whole number, 0 or more'),
  body('scrapBinQty').custom(wholeNonNegative).withMessage('Scrap (bin) must be a whole number, 0 or more'),
  body('scrapRecycleQty').custom(wholeNonNegative).withMessage('Scrap (recycle) must be a whole number, 0 or more'),
  handleValidationErrors
];

module.exports = {
  // Error handler
  handleValidationErrors,

  // The PIN rule, for routes that check it inline instead of through a chain
  PIN_REGEX,
  PIN_MESSAGE,

  // Reusable validators (for building custom validation chains)
  requiredString,
  optionalEmail,
  optionalPhone,
  optionalString,

  // Pre-built validation arrays
  validateLogin,
  validateCreateUser,
  validateUpdateUser,
  validateUpdatePreferences,
  validateCreateCompany,
  validateUpdateCompany,
  validateCreateContact,
  validateUpdateContact,
  validateCreateSupplier,
  validateUpdateSupplier,
  validateCreateMachine,
  validateUpdateMachine,
  validateJobcardListQuery,
  validateJobcardEnums,
  validateJobcardDueDate,
  validateJobcardContactFields,
  validateJobcardDescriptionRequired,
  validateStartTimer,
  validateManualTimeEntry,

  JOBCARD_STATUSES,
  PRIORITY_OPTIONS
};
