// One list of the file types a job's file folders (and the print packet) will
// accept, one upload size cap, one cap on how many files go in a combined print
// packet, and one map from a category's URL slug to its on-disk folder name —
// read by both the server routes and the client screens that show/upload them,
// so none of the four can drift out of step with the others.

// Two kinds of file. A printable one (a PDF or a picture) can be shown inside the
// app and welded into the combined printout. A stored-only one (a CAD drawing, an
// office document) is kept in the job's folder and handed back as a download to
// open in its own program — the app can neither draw it nor print it.
const PRINTABLE_FILE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.gif'];
const STORED_ONLY_FILE_EXTENSIONS = [
  '.dxf', '.dwg', '.step', '.stp', '.iges', '.igs', '.stl',
  '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt'
];
const ALLOWED_FILE_EXTENSIONS = [...PRINTABLE_FILE_EXTENSIONS, ...STORED_ONLY_FILE_EXTENSIONS];

// Whether a file of this name can be previewed in the app and go in the printout.
function isPrintableFileName(name) {
  const text = String(name || '');
  const dot = text.lastIndexOf('.');
  return dot > 0 && PRINTABLE_FILE_EXTENSIONS.includes(text.slice(dot).toLowerCase());
}

// 100 MB per uploaded file — big enough for a 3D model of an assembly or a
// multi-page colour scan (a phone photo is a few MB), small enough that one
// upload can't tie up the request thread.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

// Most files that can go in one combined print packet. The job card itself rides
// separately and doesn't count toward this.
const MAX_PRINT_FILES = 20;

// Stable URL slugs ↔ on-disk folder names. No prototype and frozen, so a lookup
// by any other text ("constructor", "__proto__") finds nothing instead of an
// inherited value that would then be fed to path.join.
const CATEGORY_FOLDER = Object.freeze(Object.assign(Object.create(null), {
  'job-files': 'Job Files',
  'customer-property-files': 'Customer Property'
}));

module.exports = { ALLOWED_FILE_EXTENSIONS, PRINTABLE_FILE_EXTENSIONS, isPrintableFileName, MAX_UPLOAD_BYTES, MAX_PRINT_FILES, CATEGORY_FOLDER };
