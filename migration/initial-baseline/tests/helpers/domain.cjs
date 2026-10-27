'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const coreFiles = ['util', 'data', 'storage', 'growth', 'characters', 'schools', 'statistics', 'ledger', 'export', 'goals', 'migration', 'equipment', 'equipment-fields', 'equipment-import', 'online'];
module.exports = function domain(overrides = {}) {
  const context = vm.createContext({ window: {}, localStorage: { getItem() { return null; }, setItem() {} }, ...overrides });
  for (const name of coreFiles) vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/renderer/js/core/' + name + '.js'), 'utf8'), context);
  return context.window.D;
};
