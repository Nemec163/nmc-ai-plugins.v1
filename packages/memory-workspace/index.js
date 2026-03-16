'use strict';

const paths = require('./lib/paths');
const fsHelpers = require('./lib/fs-helpers');
const templates = require('./lib/templates');

module.exports = {
  ...paths,
  ...fsHelpers,
  ...templates,
};
