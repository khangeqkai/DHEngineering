const entities = require('./entities');
const jobcard = require('./jobcard');
const operations = require('./operations');
const support = require('./support');
const qaLevels = require('./qa-levels');

module.exports = {
  ...entities,
  ...jobcard,
  ...operations,
  ...support,
  ...qaLevels
};
