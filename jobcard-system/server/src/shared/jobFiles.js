// One list of the file types a job's file folders (and the print packet) will
// accept, one upload size cap, one cap on how many files go in a combined print
// packet, and one map from a category's URL slug to its on-disk folder name —
// read by both the server routes and the client screens that show/upload them,
// so none of the four can drift out of step with the others.

const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.gif'];

// 30 MB per uploaded file — big enough for a phone photo, small enough that one
// upload can't tie up the request thread.
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

// Most files that can go in one combined print packet. The job card itself rides
// separately and doesn't count toward this.
const MAX_PRINT_FILES = 20;

// Stable URL slugs ↔ on-disk folder names.
const CATEGORY_FOLDER = {
  'job-files': 'Job Files',
  'customer-property-files': 'Customer Property'
};

module.exports = { ALLOWED_FILE_EXTENSIONS, MAX_UPLOAD_BYTES, MAX_PRINT_FILES, CATEGORY_FOLDER };
