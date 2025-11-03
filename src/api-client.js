const axios = require('axios');

class ShellyAPIClient {
  constructor(log, ipAddress) {
    this.log = log;
    this.ipAddress = ipAddress;
    this.baseURL = `http://${ipAddress}`;
    this.timeout = 5000; // 5 Sekunden Timeout
  }

  /**
   * Ruft den aktuellen Status des Shelly TRV ab
   * @returns {Promise<Object>} Status-Objekt mit temp, target_pos, valve_pos, etc.
   */
  async getStatus() {
    try {
      const response = await axios.get(`${this.baseURL}/status`, {
        timeout: this.timeout
      });
      
      if (response.data) {
        return response.data;
      }
      throw new Error('Keine Daten in der Antwort erhalten');
    } catch (error) {
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

