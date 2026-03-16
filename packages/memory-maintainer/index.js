'use strict';

const constants = require('./lib/constants');
const parser = require('./lib/parser');
const settings = require('./lib/settings');
const task = require('./lib/task');

module.exports = {
  ...constants,
  ...parser,
  ...settings,
  ...task,
  kanban: {
    ...constants,
  },
};
