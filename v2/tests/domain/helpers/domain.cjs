'use strict';
const { createDomain } = require('../../../src/renderer/domain/create-domain.js');
module.exports = function domain(overrides = {}) {
    return createDomain({
        gateway: overrides.window && overrides.window.mh,
        preferences: overrides.localStorage,
    });
};
