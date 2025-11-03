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

    // Initialisiere Characteristics mit Startwerten (wichtig für HomeKit)
    this.initializeCharacteristics();

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

    // Temperature Display Units (immer Celsius)
    this.thermostatService
      .getCharacteristic(this.hap.Characteristic.TemperatureDisplayUnits)
      .on('get', (callback) => {
        callback(null, this.hap.Characteristic.TemperatureDisplayUnits.CELSIUS);
      })
      .on('set', (value, callback) => {
        // Immer Celsius verwenden, andere Einheiten ignorieren
        callback(null);
      });

    // Position State (für Ventil-Position)
    // Da HomeKit keinen direkten Position-State für Thermostate hat,
    // nutzen wir CurrentHeatingCoolingState als Indikator
  }

  async getTargetTemperature(callback) {
    try {
      const status = await this.apiClient.getStatus();
      let targetTemp = null;
      
      // Prüfe die tatsächliche Struktur: thermostats[0].target_t.value
      if (status && status.thermostats && status.thermostats[0] && status.thermostats[0].target_t && status.thermostats[0].target_t.value !== undefined) {
        targetTemp = status.thermostats[0].target_t.value;
      } else if (status && status.target_t !== undefined) {
        // Fallback für andere mögliche Strukturen
        targetTemp = typeof status.target_t === 'object' ? status.target_t.value : status.target_t;
      } else if (status && status.target_pos !== undefined) {
        // Fallback: Wenn noch alte API-Struktur vorhanden ist
        targetTemp = this.targetPosToTemperature(status.target_pos);
      }
      
      if (targetTemp !== null) {
        this.log(`Target Temperature abgerufen: ${targetTemp}°C`);
        callback(null, targetTemp);
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
      this.log(`Setze Target Temperature auf ${value}°C`);
      
      await this.apiClient.setTargetTemperature(value);
      
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
      let temperature = null;
      
      // Prüfe die tatsächliche Struktur: thermostats[0].tmp.value
      if (status && status.thermostats && status.thermostats[0] && status.thermostats[0].tmp && status.thermostats[0].tmp.value !== undefined) {
        temperature = status.thermostats[0].tmp.value;
      } else if (status && status.temp !== undefined) {
        // Fallback für andere mögliche Strukturen
        temperature = typeof status.temp === 'object' ? status.temp.value : status.temp;
      }
      
      if (temperature !== null) {
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
        // Prüfe ob Thermostat aktiviert ist: thermostats[0].target_t.enabled
        let isEnabled = false;
        if (status.thermostats && status.thermostats[0] && status.thermostats[0].target_t && status.thermostats[0].target_t.enabled !== undefined) {
          isEnabled = status.thermostats[0].target_t.enabled === true;
        } else if (status.target_t_enabled !== undefined) {
          isEnabled = status.target_t_enabled === 1 || status.target_t_enabled === true;
        } else if (status.target_t !== undefined) {
          // Wenn target_t gesetzt ist und > 5°C, dann ist es aktiviert
          const targetTemp = typeof status.target_t === 'object' ? status.target_t.value : status.target_t;
          isEnabled = targetTemp > 5;
        } else if (status.target_pos !== undefined && status.target_pos > 0) {
          // Fallback für alte API-Struktur
          isEnabled = true;
        }
        
        const state = isEnabled 
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
        // Thermostat deaktivieren (target_t_enabled=0)
        // Setze niedrige Temperatur als deaktiviert
        this.log('Deaktiviere Thermostat (Heizung aus)');
        await this.apiClient.setTargetTemperature(5);
      } else if (value === this.hap.Characteristic.TargetHeatingCoolingState.HEAT) {
        // Thermostat aktivieren (auf vorherige Temperatur oder Standard)
        this.log('Aktiviere Thermostat (Heizung an)');
        const currentStatus = await this.apiClient.getStatus();
        let targetTemp = 20; // Standard
        
        // Versuche aktuelle target_t zu lesen: thermostats[0].target_t.value
        if (currentStatus && currentStatus.thermostats && currentStatus.thermostats[0] && currentStatus.thermostats[0].target_t && currentStatus.thermostats[0].target_t.value !== undefined) {
          const currentTarget = currentStatus.thermostats[0].target_t.value;
          if (currentTarget > 5) {
            targetTemp = currentTarget;
          }
        } else if (currentStatus && currentStatus.target_t !== undefined) {
          const currentTarget = typeof currentStatus.target_t === 'object' ? currentStatus.target_t.value : currentStatus.target_t;
          if (currentTarget > 5) {
            targetTemp = currentTarget;
          }
        }
        
        await this.apiClient.setTargetTemperature(targetTemp);
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
        // Zeige Heizstatus basierend auf pos (Ventilposition): thermostats[0].pos
        let valvePos = 0;
        if (status.thermostats && status.thermostats[0] && status.thermostats[0].pos !== undefined) {
          valvePos = status.thermostats[0].pos;
        } else if (status.valve_pos !== undefined) {
          valvePos = status.valve_pos;
        }
        
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

  // Hilfsfunktionen für Temperatur-Konvertierung (Fallback für alte API-Struktur)
  targetPosToTemperature(targetPos) {
    // target_pos 0-100 → Temperatur 5-35°C
    // Formel: temp = 5 + (target_pos * 0.3)
    // Diese Funktion wird nur als Fallback verwendet, wenn die neue API-Struktur nicht verfügbar ist
    return Math.round((5 + (targetPos * 0.3)) * 2) / 2; // Runden auf 0.5
  }

  // Initialisiere Characteristics mit Startwerten
  async initializeCharacteristics() {
    try {
      // Setze initiale Werte, damit HomeKit die Temperatursteuerung erkennt
      this.thermostatService
        .updateCharacteristic(this.hap.Characteristic.TemperatureDisplayUnits, this.hap.Characteristic.TemperatureDisplayUnits.CELSIUS);

      // Versuche aktuelle Werte zu laden (beim Start frische Daten holen)
      const status = await this.apiClient.getStatus(true);
      if (status && status.thermostats && status.thermostats[0]) {
        const thermostat = status.thermostats[0];
        
        if (thermostat.target_t && thermostat.target_t.value !== undefined) {
          this.thermostatService
            .updateCharacteristic(this.hap.Characteristic.TargetTemperature, thermostat.target_t.value);
        }
        
        if (thermostat.tmp && thermostat.tmp.value !== undefined) {
          this.thermostatService
            .updateCharacteristic(this.hap.Characteristic.CurrentTemperature, thermostat.tmp.value);
        }

        const isEnabled = thermostat.target_t && thermostat.target_t.enabled === true;
        const targetState = isEnabled
          ? this.hap.Characteristic.TargetHeatingCoolingState.HEAT
          : this.hap.Characteristic.TargetHeatingCoolingState.OFF;
        this.thermostatService
          .updateCharacteristic(this.hap.Characteristic.TargetHeatingCoolingState, targetState);

        const valvePos = thermostat.pos !== undefined ? thermostat.pos : 0;
        const currentState = valvePos > 10
          ? this.hap.Characteristic.CurrentHeatingCoolingState.HEAT
          : this.hap.Characteristic.CurrentHeatingCoolingState.OFF;
        this.thermostatService
          .updateCharacteristic(this.hap.Characteristic.CurrentHeatingCoolingState, currentState);
      }
    } catch (error) {
      this.log.error('Fehler beim Initialisieren der Characteristics:', error.message);
      // Setze zumindest Default-Werte
      this.thermostatService
        .updateCharacteristic(this.hap.Characteristic.TargetTemperature, 20)
        .updateCharacteristic(this.hap.Characteristic.CurrentTemperature, 20);
    }
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
      // Beim Polling immer frische Daten holen (forceRefresh = true)
      const status = await this.apiClient.getStatus(true);
      if (status && status.thermostats && status.thermostats[0]) {
        const thermostat = status.thermostats[0];
        
        // Aktualisiere Current Temperature: thermostats[0].tmp.value
        if (thermostat.tmp && thermostat.tmp.value !== undefined) {
          const currentTemp = thermostat.tmp.value;
          this.thermostatService
            .updateCharacteristic(this.hap.Characteristic.CurrentTemperature, currentTemp);
        }

        // Aktualisiere Target Temperature: thermostats[0].target_t.value
        if (thermostat.target_t && thermostat.target_t.value !== undefined) {
          const targetTemp = thermostat.target_t.value;
          this.thermostatService
            .updateCharacteristic(this.hap.Characteristic.TargetTemperature, targetTemp);
        }

        // Update Heating Cooling States: thermostats[0].target_t.enabled
        let isEnabled = false;
        if (thermostat.target_t && thermostat.target_t.enabled !== undefined) {
          isEnabled = thermostat.target_t.enabled === true;
        }

        const targetState = isEnabled
          ? this.hap.Characteristic.TargetHeatingCoolingState.HEAT
          : this.hap.Characteristic.TargetHeatingCoolingState.OFF;
        this.thermostatService
          .updateCharacteristic(this.hap.Characteristic.TargetHeatingCoolingState, targetState);

        // Current State basierend auf Ventilposition: thermostats[0].pos
        const valvePos = thermostat.pos !== undefined ? thermostat.pos : 0;
        const currentState = valvePos > 10
          ? this.hap.Characteristic.CurrentHeatingCoolingState.HEAT
          : this.hap.Characteristic.CurrentHeatingCoolingState.OFF;
        this.thermostatService
          .updateCharacteristic(this.hap.Characteristic.CurrentHeatingCoolingState, currentState);

        const currentTemp = thermostat.tmp && thermostat.tmp.value !== undefined ? thermostat.tmp.value : 'N/A';
        const targetTemp = thermostat.target_t && thermostat.target_t.value !== undefined ? thermostat.target_t.value : 'N/A';
        this.log.debug(`Status aktualisiert - Temp: ${currentTemp}°C, Target: ${targetTemp}°C, Valve: ${valvePos}%, Enabled: ${isEnabled}`);
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

