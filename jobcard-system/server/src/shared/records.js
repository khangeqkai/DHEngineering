// One "is this record still active?" check for the archived-not-deleted rows
// (users, suppliers, machines, tag options, ...): SQLite hands the flag back as
// 1/0, but a locally-built or already-mapped record can carry it as a real
// boolean, so both forms count. Read by the server and the screens alike.
function isActiveRecord(record) {
  return !!record && (record.active === 1 || record.active === true);
}

module.exports = { isActiveRecord };
