const entities = require('./entities');
const jobcard = require('./jobcard');
const operations = require('./operations');
const support = require('./support');

module.exports = {
  ...entities,
  ...jobcard,
  ...operations,
  ...support
};
