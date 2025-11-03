const ShellyAPIClient = require('./api-client');

class ShellyTRVAccessory {
  constructor(log, accessory, config, api) {
    this.log = log;
    this.accessory = accessory;
    this.config = config;
    this.api = api;
    this.hap = api.hap;

    // API Client initialisieren
    this.apiClient = new ShellyAPIClient(log, config.ip);

    // Service erstellen oder abrufen
    this.thermostatService = this.accessory.getService(this.hap.Service.Thermostat) ||
                             this.accessory.addService(this.hap.Service.Thermostat);

    // Accessory-Informationen setzen
    this.accessory.getService(this.hap.Service.AccessoryInformation)
      .setCharacteristic(this.hap.Characteristic.Manufacturer, 'Shelly')
      .setCharacteristic(this.hap.Characteristic.Model, 'TRV Gen1')
      .setCharacteristic(this.hap.Characteristic.SerialNumber, config.ip || 'Unknown');

    // Characteristics konfigurieren
    this.setupCharacteristics();

    // Status-Polling starten
    this.startPolling();
  }

  setupCharacteristics() {
    // Target Temperature (Solltemperatur)
    this.thermostatService
      .getCharacteristic(this.hap.Characteristic.TargetTemperature)
      .setProps({
        minValue: 5,
        maxValue: 35,
        minStep: 0.5
      })
      .on('get', this.getTargetTemperature.bind(this))
      .on('set', this.setTargetTemperature.bind(this));

    // Current Temperature (Aktuelle Temperatur)
    this.thermostatService
      .getCharacteristic(this.hap.Characteristic.CurrentTemperature)
      .setProps({
        minValue: -50,
        maxValue: 100,
        minStep: 0.1
      })
      .on('get', this.getCurrentTemperature.bind(this));

    // Target Heating Cooling State
    this.thermostatService
      .getCharacteristic(this.hap.Characteristic.TargetHeatingCoolingState)
      .setProps({
        validValues: [
          this.hap.Characteristic.TargetHeatingCoolingState.OFF,
          this.hap.Characteristic.TargetHeatingCoolingState.HEAT
        ]
      })
      .on('get', this.getTargetHeatingCoolingState.bind(this))
      .on('set', this.setTargetHeatingCoolingState.bind(this));

    // Current Heating Cooling State
    this.thermostatService
      .getCharacteristic(this.hap.Characteristic.CurrentHeatingCoolingState)
      .on('get', this.getCurrentHeatingCoolingState.bind(this));

    // Temperature Display Units
    this.thermostatService
      .getCharacteristic(this.hap.Characteristic.TemperatureDisplayUnits)
      .on('get', (callback) => {
        callback(null, this.hap.Characteristic.TemperatureDisplayUnits.CELSIUS);
      });

    // Position State (für Ventil-Position)
    // Da HomeKit keinen direkten Position-State für Thermostate hat,
    // nutzen wir CurrentHeatingCoolingState als Indikator
  }

  async getTargetTemperature(callback) {
    try {
      const status = await this.apiClient.getStatus();
      if (status && status.target_pos !== undefined) {
        // Konvertiere target_pos (0-100) zu Temperatur (5-35°C)
        const temperature = this.targetPosToTemperature(status.target_pos);
        this.log(`Target Temperature abgerufen: ${temperature}°C (target_pos: ${status.target_pos})`);
        callback(null, temperature);
      } else {
        callback(new Error('Keine Target Temperature verfügbar'));
      }
    } catch (error) {
      this.log.error('Fehler beim Abrufen der Target Temperature:', error.message);
      callback(error);
    }
  }

  async setTargetTemperature(value, callback) {
    try {
      // Konvertiere Temperatur (5-35°C) zu target_pos (0-100)
      const targetPos = this.temperatureToTargetPos(value);
      this.log(`Setze Target Temperature auf ${value}°C (target_pos: ${targetPos})`);
      
      await this.apiClient.setTargetPosition(targetPos);
      
      // Aktualisiere sofort den Status
      setTimeout(() => this.updateStatus(), 1000);
      
      callback(null);
    } catch (error) {
      this.log.error('Fehler beim Setzen der Target Temperature:', error.message);
      callback(error);
    }
  }

  async getCurrentTemperature(callback) {
    try {
      const status = await this.apiClient.getStatus();
      if (status && status.temp !== undefined) {
        const temperature = status.temp;
        this.log(`Current Temperature abgerufen: ${temperature}°C`);
        callback(null, temperature);
      } else {
        callback(new Error('Keine Current Temperature verfügbar'));
      }
    } catch (error) {
      this.log.error('Fehler beim Abrufen der Current Temperature:', error.message);
      callback(error);
    }
  }

  async getTargetHeatingCoolingState(callback) {
    try {
      const status = await this.apiClient.getStatus();
      if (status) {
        // Wenn target_pos > 0, dann ist Heizung AN
        const state = status.target_pos > 0 
          ? this.hap.Characteristic.TargetHeatingCoolingState.HEAT
          : this.hap.Characteristic.TargetHeatingCoolingState.OFF;
        callback(null, state);
      } else {
        callback(null, this.hap.Characteristic.TargetHeatingCoolingState.OFF);
      }
    } catch (error) {
      this.log.error('Fehler beim Abrufen des Target Heating Cooling State:', error.message);
      callback(null, this.hap.Characteristic.TargetHeatingCoolingState.OFF);
    }
  }

  async setTargetHeatingCoolingState(value, callback) {
    try {
      if (value === this.hap.Characteristic.TargetHeatingCoolingState.OFF) {
        // Ventil schließen
        this.log('Schließe Ventil (Heizung aus)');
        await this.apiClient.setTargetPosition(0);
      } else if (value === this.hap.Characteristic.TargetHeatingCoolingState.HEAT) {
        // Ventil öffnen (auf vorherige Temperatur oder Standard)
        this.log('Öffne Ventil (Heizung an)');
        const currentStatus = await this.apiClient.getStatus();
        if (currentStatus && currentStatus.target_pos === 0) {
          // Setze auf Standard-Temperatur (20°C) wenn Ventil geschlossen war
          await this.apiClient.setTargetPosition(this.temperatureToTargetPos(20));
        }
      }
      setTimeout(() => this.updateStatus(), 1000);
      callback(null);
    } catch (error) {
      this.log.error('Fehler beim Setzen des Target Heating Cooling State:', error.message);
      callback(error);
    }
  }

  async getCurrentHeatingCoolingState(callback) {
    try {
      const status = await this.apiClient.getStatus();
      if (status) {
        // Zeige Heizstatus basierend auf valve_pos (Ventilposition)
        const valvePos = status.valve_pos || 0;
        const state = valvePos > 10 // Wenn Ventil mehr als 10% geöffnet ist
          ? this.hap.Characteristic.CurrentHeatingCoolingState.HEAT
          : this.hap.Characteristic.CurrentHeatingCoolingState.OFF;
        callback(null, state);
      } else {
        callback(null, this.hap.Characteristic.CurrentHeatingCoolingState.OFF);
      }
    } catch (error) {
      this.log.error('Fehler beim Abrufen des Current Heating Cooling State:', error.message);
      callback(null, this.hap.Characteristic.CurrentHeatingCoolingState.OFF);
    }
  }

  // Hilfsfunktionen für Temperatur-Konvertierung
  targetPosToTemperature(targetPos) {
    // target_pos 0-100 → Temperatur 5-35°C
    // Formel: temp = 5 + (target_pos * 0.3)
    return Math.round((5 + (targetPos * 0.3)) * 2) / 2; // Runden auf 0.5
  }

  temperatureToTargetPos(temperature) {
    // Temperatur 5-35°C → target_pos 0-100
    // Formel: target_pos = (temp - 5) / 0.3
    const pos = Math.round(((temperature - 5) / 0.3));
    return Math.max(0, Math.min(100, pos)); // Begrenze auf 0-100
  }

  // Status-Polling
  startPolling() {
    // Initiale Status-Aktualisierung
    this.updateStatus();

    // Polling alle 15 Sekunden
    this.pollInterval = setInterval(() => {
      this.updateStatus();
    }, 15000);
  }

  async updateStatus() {
    try {
      const status = await this.apiClient.getStatus();
      if (status) {
        // Aktualisiere Characteristics
        if (status.temp !== undefined) {
          this.thermostatService
            .updateCharacteristic(this.hap.Characteristic.CurrentTemperature, status.temp);
        }

        if (status.target_pos !== undefined) {
          const targetTemp = this.targetPosToTemperature(status.target_pos);
          this.thermostatService
            .updateCharacteristic(this.hap.Characteristic.TargetTemperature, targetTemp);
        }

        // Update Heating Cooling States
        const targetState = status.target_pos > 0
          ? this.hap.Characteristic.TargetHeatingCoolingState.HEAT
          : this.hap.Characteristic.TargetHeatingCoolingState.OFF;
        this.thermostatService
          .updateCharacteristic(this.hap.Characteristic.TargetHeatingCoolingState, targetState);

        const currentState = (status.valve_pos || 0) > 10
          ? this.hap.Characteristic.CurrentHeatingCoolingState.HEAT
          : this.hap.Characteristic.CurrentHeatingCoolingState.OFF;
        this.thermostatService
          .updateCharacteristic(this.hap.Characteristic.CurrentHeatingCoolingState, currentState);

        this.log.debug(`Status aktualisiert - Temp: ${status.temp}°C, Target: ${status.target_pos}%, Valve: ${status.valve_pos}%`);
      }
    } catch (error) {
      this.log.error('Fehler beim Status-Update:', error.message);
    }
  }

  // Cleanup beim Entfernen des Accessories
  shutdown() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }
}

module.exports = ShellyTRVAccessory;

