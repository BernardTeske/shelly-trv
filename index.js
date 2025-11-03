const ShellyTRVPlatform = require('./src/platform');

module.exports = (api) => {
  api.registerPlatform('ShellyTRV', ShellyTRVPlatform);
};

