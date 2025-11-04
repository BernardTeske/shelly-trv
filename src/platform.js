const ShellyTRVAccessory = require('./accessory');

class ShellyTRVPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;
    this.accessories = [];
    
    // Request-Queue für serielle Abarbeitung von Requests
    this.requestQueue = [];
    this.processingQueue = false;
    this.requestDelay = 500; // 500ms Verzögerung zwischen Requests

    // Warte auf Homebridge initialisierung
    this.api.on('didFinishLaunching', () => {
      this.log('Shelly TRV Platform gestartet');
      this.loadAccessories();
    });
  }

  /**
   * Fügt eine Request-Funktion zur Queue hinzu
   * Requests werden nacheinander abgearbeitet, um Überlastung zu vermeiden
   * @param {Function} requestFn - Async Funktion, die den Request ausführt
   * @returns {Promise} - Promise, das mit dem Request-Ergebnis resolved wird
   */
  async queueRequest(requestFn) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        fn: requestFn,
        resolve,
        reject
      });
      this.processQueue();
    });
  }

  /**
   * Verarbeitet die Request-Queue nacheinander
   */
  async processQueue() {
    if (this.processingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.processingQueue = true;

    while (this.requestQueue.length > 0) {
      const item = this.requestQueue.shift();
      
      try {
        const result = await item.fn();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }

      // Verzögerung zwischen Requests (außer beim letzten)
      if (this.requestQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.requestDelay));
      }
    }

    this.processingQueue = false;
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

      // Initialisiere Shelly TRV Service (mit Platform-Referenz für Request-Queue)
      new ShellyTRVAccessory(this.log, accessory, deviceConfig, this.api, this);
    });
  }
}

module.exports = ShellyTRVPlatform;

