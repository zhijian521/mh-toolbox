const path = require('node:path');
const fs = require('node:fs');
const PROFILE_NAME = 'mh-tool-v2';

function configureProfile(app) {
    app.setName(PROFILE_NAME);
    const userData = path.join(app.getPath('appData'), PROFILE_NAME);
    const sessionData = path.join(userData, 'session');
    fs.mkdirSync(sessionData, { recursive: true });
    app.setPath('userData', userData);
    app.setPath('sessionData', sessionData);
    app.setAppLogsPath(path.join(userData, 'logs'));
    return userData;
}
module.exports = { PROFILE_NAME, configureProfile };
