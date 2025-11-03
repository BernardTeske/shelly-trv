const ShellyTRVAccessory = require('./accessory');

class ShellyTRVPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;
    this.accessories = [];

    // Warte auf Homebridge initialisierung
    this.api.on('didFinishLaunching', () => {
      this.log('Shelly TRV Platform gestartet');
      this.loadAccessories();
    });
  }

  configureAccessory(accessory) {
    this.log('Konfiguriere Accessory:', accessory.displayName);
    this.accessories.push(accessory);
  }

  loadAccessories() {
    const devices = this.config.devices || [];

    if (devices.length === 0) {
      this.log.warn('Keine Shelly TRV Geräte in der Konfiguration gefunden');
      return;
    }

    devices.forEach((deviceConfig, index) => {
      const uuid = this.api.hap.uuid.generate(deviceConfig.ip || `device-${index}`);
      
      // Prüfe ob Accessory bereits existiert
      let accessory = this.accessories.find(acc => acc.UUID === uuid);

      if (!accessory) {
        // Erstelle neues Accessory
        this.log('Erstelle neues Accessory:', deviceConfig.name);
        accessory = new this.api.platformAccessory(
          deviceConfig.name || `Shelly TRV ${index + 1}`,
          uuid
        );
        this.api.registerPlatformAccessories('homebridge-shelly-trv', 'ShellyTRV', [accessory]);
        this.accessories.push(accessory);
      } else {
        this.log('Accessory bereits vorhanden:', accessory.displayName);
      }

      // Initialisiere Shelly TRV Service
      new ShellyTRVAccessory(this.log, accessory, deviceConfig, this.api);
    });
  }
}

module.exports = ShellyTRVPlatform;

