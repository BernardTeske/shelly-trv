const axios = require('axios');

class ShellyAPIClient {
  constructor(log, ipAddress) {
    this.log = log;
    this.ipAddress = ipAddress;
    this.baseURL = `http://${ipAddress}`;
    this.timeout = 5000; // 5 Sekunden Timeout
    
    // Cache für Status-Abfragen
    this.statusCache = null;
    this.statusCacheTimestamp = null;
    this.statusCacheTTL = 30000; // 5 Sekunden Cache-TTL
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
   * Ruft den aktuellen Status des Shelly TRV ab (mit Cache)
   * @param {boolean} forceRefresh - Erzwingt eine neue Abfrage, auch wenn Cache gültig ist
   * @returns {Promise<Object>} Status-Objekt mit temp, target_pos, valve_pos, etc.
   */
  async getStatus(forceRefresh = false) {
    // Prüfe Cache, wenn nicht erzwungen
    if (!forceRefresh && this.isCacheValid()) {
      this.log.debug(`Status aus Cache gelesen für ${this.ipAddress}`);
      return this.statusCache;
    }

    try {
      const response = await axios.get(`${this.baseURL}/status`, {
        timeout: this.timeout
      });
      
      if (response.data) {
        // Aktualisiere Cache
        this.statusCache = response.data;
        this.statusCacheTimestamp = Date.now();
        this.log.debug(`Status vom Gerät abgerufen und Cache aktualisiert für ${this.ipAddress}`);
        return response.data;
      }
      throw new Error('Keine Daten in der Antwort erhalten');
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
   * Setzt die Zieltemperatur des Thermostats
   * @param {number} temperature - Temperatur in Grad Celsius (z.B. 20.5)
   * @returns {Promise<void>}
   */
  async setTargetTemperature(temperature) {
    // Stelle sicher, dass Temperatur im gültigen Bereich ist (5-35°C)
    const clampedTemp = Math.max(5, Math.min(35, Math.round(temperature * 2) / 2)); // Runden auf 0.5
    
    try {
      const url = `${this.baseURL}/settings/thermostat/0?target_t_enabled=1&target_t=${clampedTemp}`;
      const response = await axios.get(url, {
        timeout: this.timeout
      });
      
      this.log(`Target Temperature erfolgreich gesetzt: ${clampedTemp}°C`);
      
      // Cache invalideren, da sich der Status geändert hat
      this.invalidateCache();
      
      return response.data;
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
  }
}

module.exports = ShellyAPIClient;

