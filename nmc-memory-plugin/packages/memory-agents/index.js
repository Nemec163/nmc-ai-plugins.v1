'use strict';

const manifest = require('./lib/manifest');
const render = require('./lib/render');
const roster = require('./lib/roster');

module.exports = {
  ...roster,
  ...manifest,
  ...render,
};
