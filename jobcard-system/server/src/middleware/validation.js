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
const { FUTURE_LEEWAY_MS } = require('../shared/finishAnswer');
const { MAX_MENTIONS, TOO_MANY_MENTIONS_MESSAGE } = require('../shared/mentions');

// Fields a screen shows under a different box than the body key: the people a comment asks
// are worked out from its text, so every refusal about them marks the comment's text box
// (the route's own mention refusals already report 'text').
const FIELD_ALIASES = { mentionUserIds: 'text' };

/**
 * Middleware to handle validation errors
 * Returns a 400 response with clear error messages if validation fails
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // A check with no wording of its own comes back as "Invalid value"; say something a person can act on.
    const errArray = errors.array().map(err => (err.msg === 'Invalid value'
      ? { ...err, msg: 'Something in that isn\'t right. Reload the page and try again.' }
      : err));
    const messages = errArray.map(err => err.msg);
    return res.status(400).json({
      error: 'Some details need fixing. Check the marked boxes and try again.',
      details: messages,
      // Which field each message belongs to, so a screen can mark the box itself
      // instead of only popping up the message. express-validator 7 names it
      // `path` (an older major would call it `param`) — use whichever exists.
      fields: errArray.map(err => {
        const field = err.path !== undefined ? err.path : err.param;
        return { field: FIELD_ALIASES[field] || field, message: err.msg };
      })
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
// What a person reads under a blank required box: "Enter the company name."
function enterMessage(label, verb = 'Enter') {
  return `${verb} the ${label.toLowerCase()}.`;
}

function requiredString(field, label, verb) {
  return body(field)
    .exists({ checkFalsy: true })
    .withMessage(enterMessage(label, verb))
    .isString()
    .withMessage(enterMessage(label, verb))
    .trim()
    .isLength({ min: 1 })
    .withMessage(enterMessage(label, verb));
}

/**
 * A field an edit may leave out (the record keeps what it has), but which can't
 * be blanked when it is sent — a customer's or supplier's name, a machine number.
 * The management edit forms send only the fields the person changed, so an edit
 * that doesn't touch the name doesn't carry it at all.
 * @param {string} field - Field name to validate
 * @param {string} label - Human-readable field label for error messages
 */
function requiredIfSent(field, label) {
  return body(field)
    .optional()
    .isString()
    .withMessage(enterMessage(label))
    .trim()
    .isLength({ min: 1 })
    .withMessage(enterMessage(label));
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
    .withMessage(`The ${label.toLowerCase()} can be at most ${NAME_MAX} characters. Shorten it.`);
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
    .withMessage('Enter an email address like name@example.com.')
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
    .withMessage('The phone number can only use digits, spaces, dashes, brackets and a plus sign.')
    .isLength({ min: 6, max: 20 })
    .withMessage('The phone number needs to be between 6 and 20 characters long.');
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
    .withMessage(`Enter the ${label.toLowerCase()} as text.`)
    .trim()
    .isLength({ max: maxLength })
    .withMessage(`The ${label.toLowerCase()} can be at most ${maxLength} characters. Shorten it.`);
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
    .withMessage(`Pick the ${label.toLowerCase()} from the list.`);
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
  'jobNumber', 'timer', 'description', 'company', 'customer', 'assignedTo',
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
    .isLength({ max: USERNAME_MAX_LENGTH }).withMessage(`The username can be at most ${USERNAME_MAX_LENGTH} characters.`),
  requiredString('password', 'Password')
    .isLength({ max: 64 }).withMessage('The PIN is too long.'),
  body('homeAccessCode')
    .optional()
    .isString().withMessage('Enter the home access code as text.')
    .isLength({ max: 72 }).withMessage('The home access code is too long.'),
  handleValidationErrors
];

/**
 * Create user validation
 * POST /auth/users
 */
const validateCreateUser = [
  requiredString('username', 'Username')
    .isLength({ max: USERNAME_MAX_LENGTH }).withMessage(`The username can be at most ${USERNAME_MAX_LENGTH} characters.`),
  body('password')
    .exists({ checkFalsy: true })
    .withMessage('Enter a PIN.')
    .isString()
    .matches(PIN_REGEX)
    .withMessage(PIN_MESSAGE),
  optionalEmail('email'),
  requiredString('name', 'Name').isLength({ max: 100 }).withMessage('The name can be at most 100 characters. Shorten it.'),
  body('role')
    .optional()
    .isIn(ALL_ROLES)
    .withMessage('Pick a role: admin, manager or user.'),
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
  body('requiresPo').optional().isBoolean({ strict: true }).withMessage('Tick or untick "Needs a PO number for invoicing".'),
  handleValidationErrors
];

// PUT /companies/:id — every field optional: a field left out keeps its value.
const validateUpdateCompany = [
  requiredIfSent('name', 'Company name'),
  nameLength('name', 'Company name', storedCompanyName),
  optionalString('address', 'Address', 500),
  optionalString('notes', 'Notes', 1000),
  body('requiresPo').optional().isBoolean({ strict: true }).withMessage('Tick or untick "Needs a PO number for invoicing".'),
  handleValidationErrors
];

// POST /contacts — a person always belongs to a company.
const validateCreateContact = [
  requiredString('companyId', 'Company', 'Pick'),
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

// PUT /suppliers/:id — every field optional: a field left out keeps its value.
const validateUpdateSupplier = [
  requiredIfSent('name', 'Supplier name'),
  optionalEmail('contactEmail'),
  optionalPhone('contactPhone'),
  handleValidationErrors
];

// POST /machines — a machine is its number (required, non-blank, and free of the
// comma that separates machines in logged work — otherwise "CNC,01" reads back as
// two machines); name and description are optional free text, unvalidated here (as
// before). Mirrors validateCreateSupplier.
function machineNumberRule(chain) {
  return chain
    .custom((value) => !hasMachineSeparator(value))
    .withMessage(MACHINE_SEPARATOR_MESSAGE);
}

const validateCreateMachine = [
  machineNumberRule(requiredString('machineNumber', 'Machine number')),
  handleValidationErrors
];

// PUT /machines/:id — the number may be left out (the machine keeps it).
const validateUpdateMachine = [
  machineNumberRule(requiredIfSent('machineNumber', 'Machine number')),
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
    .withMessage('The column order could not be saved. Reload the page and try again.')
    .bail()
    .custom((value) => {
      const seen = new Set();
      for (const id of value) {
        if (typeof id !== 'string' || !JOBCARD_COLUMN_IDS.includes(id)) {
          throw new Error('The column order could not be saved. Reload the page and try again.');
        }
        if (seen.has(id)) {
          throw new Error('The column order could not be saved. Reload the page and try again.');
        }
        seen.add(id);
      }
      return true;
    }),
  body('jobcardHiddenColumns')
    .optional()
    .isArray({ max: HIDEABLE_COLUMN_IDS.length })
    .withMessage('The hidden columns could not be saved. Reload the page and try again.')
    .bail()
    .custom((value) => {
      const seen = new Set();
      for (const id of value) {
        if (typeof id !== 'string' || !HIDEABLE_COLUMN_IDS.includes(id)) {
          throw new Error('The hidden columns could not be saved. Reload the page and try again.');
        }
        if (seen.has(id)) {
          throw new Error('The hidden columns could not be saved. Reload the page and try again.');
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
    .withMessage('Pick a person from the list, or Unassigned.'),
  query('status')
    .optional()
    .isString()
    .withMessage('Pick a status from the list.'),
  handleValidationErrors
];

/**
 * Search box and its filters. Every value must be a single piece of text: a link
 * that repeats a filter (q=a&q=b) or nests one (q[x]=1) would otherwise reach the
 * search code as a list or object and break it, so it is refused here instead.
 * GET /search
 */
const SEARCH_QUERY_KEYS = [
  'scope', 'q', 'page', 'status', 'assigneeId', 'priority', 'jobType', 'qualityLevel',
  'dateFrom', 'dateTo', 'dateField', 'includeArchived', 'peopleType', 'userId', 'action',
  'entityType', 'field', 'workerId', 'machineId', 'jobNumber'
];
const validateSearchQuery = [
  query(SEARCH_QUERY_KEYS)
    .optional()
    .isString()
    .withMessage('The search could not be read. Clear the filters and try again.'),
  handleValidationErrors
];

/**
 * Missing-attachments check for the job list. The list asks about one page of
 * rows at a time (50), plus a pinned job; each id costs a folder read, so the
 * number of jobs per request is capped.
 * POST /jobcards/attachment-warnings
 */
const ATTACHMENT_WARNINGS_MAX_IDS = 100;
const validateAttachmentWarningsBody = [
  body('ids')
    .optional()
    .isArray({ max: ATTACHMENT_WARNINGS_MAX_IDS })
    .withMessage(`Too many jobs were checked at once. Try again with a shorter list.`),
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
    throw new Error('Enter a job description.');
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
    throw new Error('Enter a real due date.');
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
    .withMessage('Pick which part this time belongs to.')
    .bail()
    .isString()
    .withMessage('Pick which part this time belongs to.')
    .trim()
    .notEmpty()
    .withMessage('Pick which part this time belongs to.'),
  // Optional: an admin may start the timer for another worker. Light guard only —
  // the route validates the worker exists and is active via resolveWorkerId.
  body('workerId')
    .optional({ checkFalsy: true })
    .isString()
    .withMessage('Pick the worker from the list.'),
  handleValidationErrors
];

// The worker's answer about a clock that stopped itself: when they really finished and
// whether they are still working. Whether the finish is after the start and not later than
// it could have been depends on the row, so the route judges that.
const validateConfirmFinish = [
  body('finishTime')
    .custom(v => typeof v === 'string' && v.trim() !== '')
    .withMessage('Enter the time you finished.')
    .bail()
    .custom(v => !isNaN(new Date(v).getTime()))
    .withMessage('Enter a real finish time.'),
  body('stillWorking')
    .isBoolean({ strict: true })
    .withMessage('Say whether you are still working on it: Yes or No.'),
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
    throw new Error('Enter a whole number, 0 or more.');
  }
  return true;
};

// The edit route takes the same rules with the start optional (startRequired false): the
// manual edit form sends a time only when the manager changed it, and the route keeps the
// stored one for a time left out — so there the finish is compared with the start only
// when both were sent, and the route judges the pair it will actually store.
const manualTimeEntryRules = ({ startRequired }) => {
  const start = () => (startRequired ? body('startTime') : body('startTime').optional());
  return [
    (startRequired
      ? body('startTime').exists({ checkNull: true }).withMessage('Enter the time the work started.').bail()
      : start())
      .custom(v => v !== null && !isNaN(new Date(v).getTime()))
      .withMessage('Enter a real start time.'),
    // The form fills its start box from the office PC's own clock, which can run
    // several minutes ahead of this one, so up to FUTURE_LEEWAY_MS (15 minutes) ahead is taken as
    // "now". Further than that is a mistyped hour or day, not clock drift. A Stop
    // on a block that still starts ahead of the clock is discarded as a tap (see
    // startTimerUndo.js), so the leeway can never produce a negative block.
    start()
      .custom(v => new Date(v).getTime() <= Date.now() + FUTURE_LEEWAY_MS)
      .withMessage('The start time can\'t be in the future. Check the date and hour.'),
    body('endTime')
      .optional({ nullable: true, checkFalsy: true })
      .custom(v => !isNaN(new Date(v).getTime()))
      .withMessage('Enter a real finish time.'),
    body('endTime')
      .optional({ nullable: true, checkFalsy: true })
      .custom((v, { req }) => req.body.startTime === undefined ||
        new Date(v).getTime() > new Date(req.body.startTime).getTime())
      .withMessage('The finish time has to be after the start time.'),
    // Same leeway as the start: a finish further ahead than clock drift is a mistyped
    // hour or day, and would be billed and counted toward Done straight away. The
    // stop form never trips this — its finish is the real stop time the server stored.
    body('endTime')
      .optional({ nullable: true, checkFalsy: true })
      .custom(v => new Date(v).getTime() <= Date.now() + FUTURE_LEEWAY_MS)
      .withMessage('The finish time can\'t be in the future. Check the date and hour.'),
    // Only an edit states what it does with the finish; adding a block has no stored finish to act on.
    ...(startRequired ? [] : [
      body('finishAction')
        .optional()
        .isIn(['confirm', 'correct', 'reopen'])
        .withMessage('Choose what to do with the finish time.'),
      body('finishVersion').optional().isString().withMessage('This finish time changed. Reload the job and try again.')
    ]),
    body('qty').custom(wholeNonNegative).withMessage('Enter a whole number of good pieces, 0 or more.'),
    body('scrapBinQty').custom(wholeNonNegative).withMessage('Enter a whole number for scrap (bin), 0 or more.'),
    body('scrapRecycleQty').custom(wholeNonNegative).withMessage('Enter a whole number for scrap (recycle), 0 or more.'),
    handleValidationErrors
  ];
};

// Marking a job's comments as read up to a moment. Any valid ISO-8601 moment is accepted,
// then rewritten to the stored shape (milliseconds, Z): the route's cap and the read-mark
// MAX compare moments as text, which only orders correctly when every value is written the
// same way. One message for every way the value can be wrong, and bail() stops at the first
// failure, so the refusal always carries it and the rewrite never sees a bad value.
const SEEN_UP_TO_MESSAGE = 'The comments could not be marked as read. Reload the job and try again.';
const validateMarkNotesRead = [
  body('seenUpTo')
    .isString().withMessage(SEEN_UP_TO_MESSAGE).bail()
    .isISO8601({ strict: true }).withMessage(SEEN_UP_TO_MESSAGE).bail()
    .custom(v => !Number.isNaN(new Date(v).getTime())).withMessage(SEEN_UP_TO_MESSAGE).bail()
    .customSanitizer(v => new Date(v).toISOString()),
  handleValidationErrors
];

// The people @mentioned in a new comment: optional, at most 20 ids. Whether each id is a real,
// active person is checked by the route (it needs the database); this only checks the shape.
// A value that isn't a list at all, or holds something other than ids, gets the same
// "pick them again" message: only a real list that is too long is told it asked too many.
const MENTION_IDS_GARBLED = 'Couldn’t tell who was asked. Pick them again from the @ list.';
const validateMentionUserIds = body('mentionUserIds')
  .optional({ nullable: true })
  .isArray().withMessage(MENTION_IDS_GARBLED).bail()
  .isArray({ max: MAX_MENTIONS }).withMessage(TOO_MANY_MENTIONS_MESSAGE).bail()
  .custom(list => list.every(v => typeof v === 'string' && v.trim().length > 0))
  .withMessage(MENTION_IDS_GARBLED);

const validateManualTimeEntry = manualTimeEntryRules({ startRequired: true });
const validateTimeEntryEdit = manualTimeEntryRules({ startRequired: false });

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
  validateSearchQuery,
  validateAttachmentWarningsBody,
  validateJobcardEnums,
  validateJobcardDueDate,
  validateJobcardContactFields,
  validateJobcardDescriptionRequired,
  validateStartTimer,
  validateConfirmFinish,
  validateManualTimeEntry,
  validateTimeEntryEdit,
  validateMarkNotesRead,
  validateMentionUserIds,
  MENTION_IDS_GARBLED,

  JOBCARD_STATUSES,
  PRIORITY_OPTIONS
};
