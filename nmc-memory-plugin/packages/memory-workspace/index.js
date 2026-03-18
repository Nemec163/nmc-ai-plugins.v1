'use strict';

const paths = require('./lib/paths');
const fsHelpers = require('./lib/fs-helpers');
const scaffold = require('./lib/scaffold');
const templates = require('./lib/templates');

module.exports = {
  ...paths,
  ...fsHelpers,
  ...scaffold,
  ...templates,
};
