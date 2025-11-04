const axios = require('axios');

class ShellyAPIClient {
  constructor(log, ipAddress, platform) {
    this.log = log;
    this.ipAddress = ipAddress;
    this.baseURL = `http://${ipAddress}`;
    this.timeout = 5000; // 5 Sekunden Timeout
    this.platform = platform; // Platform-Instanz für Request-Queue
    
    // Cache für Status-Abfragen
    this.statusCache = null;
    this.statusCacheTimestamp = null;
    this.statusCacheTTL = 60000; // 60 Sekunden Cache-TTL (reduziert Traffic)
  }

  /**
   * Prüft ob der Cache noch gültig ist
   * @returns {boolean}
   */
  isCacheValid() {
    if (!this.statusCache || !this.statusCacheTimestamp) {
      return false;
    }
    const now = Date.now();
    return (now - this.statusCacheTimestamp) < this.statusCacheTTL;
  }

  /**
   * Interne Methode zum Abrufen des Status (ohne Queue)
   * @param {boolean} forceRefresh - Erzwingt eine neue Abfrage, auch wenn Cache gültig ist
   * @returns {Promise<Object>} Status-Objekt
   */
  async _getStatusInternal(forceRefresh = false) {
    // Prüfe Cache, wenn nicht erzwungen
    if (!forceRefresh && this.isCacheValid()) {
      // Cache wird genutzt - kein Log um Traffic zu reduzieren
      return this.statusCache;
    }

    const response = await axios.get(`${this.baseURL}/status`, {
      timeout: this.timeout
    });
    
    if (response.data) {
      // Aktualisiere Cache
      this.statusCache = response.data;
      this.statusCacheTimestamp = Date.now();
      // Nur bei forceRefresh loggen, um Traffic zu reduzieren
      if (forceRefresh) {
        this.log.debug(`Status vom Gerät abgerufen und Cache aktualisiert für ${this.ipAddress}`);
      }
      return response.data;
    }
    throw new Error('Keine Daten in der Antwort erhalten');
  }

  /**
   * Ruft den aktuellen Status des Shelly TRV ab (mit Cache und Queue)
   * @param {boolean} forceRefresh - Erzwingt eine neue Abfrage, auch wenn Cache gültig ist
   * @returns {Promise<Object>} Status-Objekt mit temp, target_pos, valve_pos, etc.
   */
  async getStatus(forceRefresh = false) {
    // Prüfe Cache zuerst (kein Request nötig)
    if (!forceRefresh && this.isCacheValid()) {
      return this.statusCache;
    }

    // Wenn Platform vorhanden ist, nutze Request-Queue
    if (this.platform) {
      try {
        return await this.platform.queueRequest(() => this._getStatusInternal(forceRefresh));
      } catch (error) {
        // Wenn Cache vorhanden ist und Request fehlschlägt, verwende Cache als Fallback
        if (this.statusCache && this.isCacheValid()) {
          this.log.warn(`Status-Request fehlgeschlagen, verwende Cache für ${this.ipAddress}: ${error.message}`);
          return this.statusCache;
        }
        
        if (error.code === 'ECONNABORTED') {
          this.log.error(`Timeout beim Abrufen des Status von ${this.ipAddress}`);
          throw new Error('Timeout: Gerät antwortet nicht');
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          this.log.error(`Gerät nicht erreichbar: ${this.ipAddress}`);
          throw new Error('Gerät nicht erreichbar');
        } else {
          this.log.error(`Fehler beim Abrufen des Status: ${error.message}`);
          throw error;
        }
      }
    } else {
      // Fallback: Direkt ohne Queue (für Kompatibilität)
      return await this._getStatusInternal(forceRefresh);
    }
  }

  /**
   * Invalidiert den Cache (z.B. nach einer Änderung)
   */
  invalidateCache() {
    this.statusCache = null;
    this.statusCacheTimestamp = null;
    this.log.debug(`Cache invalidiert für ${this.ipAddress}`);
  }

  /**
   * Ruft die Einstellungen des Shelly TRV ab
   * @returns {Promise<Object>} Settings-Objekt
   */
  async getSettings() {
    try {
      const response = await axios.get(`${this.baseURL}/settings`, {
        timeout: this.timeout
      });
      
      if (response.data) {
        return response.data;
      }
      throw new Error('Keine Daten in der Antwort erhalten');
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        this.log.error(`Timeout beim Abrufen der Einstellungen von ${this.ipAddress}`);
        throw new Error('Timeout: Gerät antwortet nicht');
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        this.log.error(`Gerät nicht erreichbar: ${this.ipAddress}`);
        throw new Error('Gerät nicht erreichbar');
      } else {
        this.log.error(`Fehler beim Abrufen der Einstellungen: ${error.message}`);
        throw error;
      }
    }
  }

  /**
   * Interne Methode zum Setzen der Temperatur (ohne Queue)
   * @param {number} temperature - Temperatur in Grad Celsius
   * @returns {Promise<Object>}
   */
  async _setTargetTemperatureInternal(temperature) {
    const url = `${this.baseURL}/settings/thermostat/0?target_t_enabled=1&target_t=${temperature}`;
    const response = await axios.get(url, {
      timeout: this.timeout
    });
    
    this.log(`Target Temperature erfolgreich gesetzt: ${temperature}°C`);
    
    // Cache invalideren, da sich der Status geändert hat
    this.invalidateCache();
    
    return response.data;
  }

  /**
   * Setzt die Zieltemperatur des Thermostats
   * @param {number} temperature - Temperatur in Grad Celsius (z.B. 20.5)
   * @returns {Promise<void>}
   */
  async setTargetTemperature(temperature) {
    // Stelle sicher, dass Temperatur im gültigen Bereich ist (5-35°C)
    const clampedTemp = Math.max(5, Math.min(35, Math.round(temperature * 2) / 2)); // Runden auf 0.5
    
    // Wenn Platform vorhanden ist, nutze Request-Queue
    if (this.platform) {
      try {
        return await this.platform.queueRequest(() => this._setTargetTemperatureInternal(clampedTemp));
      } catch (error) {
        if (error.code === 'ECONNABORTED') {
          this.log.error(`Timeout beim Setzen der Target Temperature von ${this.ipAddress}`);
          throw new Error('Timeout: Gerät antwortet nicht');
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          this.log.error(`Gerät nicht erreichbar: ${this.ipAddress}`);
          throw new Error('Gerät nicht erreichbar');
        } else {
          this.log.error(`Fehler beim Setzen der Target Temperature: ${error.message}`);
          throw error;
        }
      }
    } else {
      // Fallback: Direkt ohne Queue
      return await this._setTargetTemperatureInternal(clampedTemp);
    }
  }
}

module.exports = ShellyAPIClient;

