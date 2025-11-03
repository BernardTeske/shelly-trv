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
   * Setzt die Zielposition des Ventils (target_pos: 0-100)
   * @param {number} targetPos - Position zwischen 0 und 100
   * @returns {Promise<void>}
   */
  async setTargetPosition(targetPos) {
    // Stelle sicher, dass targetPos im gültigen Bereich ist
    const clampedPos = Math.max(0, Math.min(100, Math.round(targetPos)));
    
    try {
      const response = await axios.post(
        `${this.baseURL}/settings?target_pos=${clampedPos}`,
        null,
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      this.log(`Target Position erfolgreich gesetzt: ${clampedPos}%`);
      return response.data;
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        this.log.error(`Timeout beim Setzen der Target Position von ${this.ipAddress}`);
        throw new Error('Timeout: Gerät antwortet nicht');
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        this.log.error(`Gerät nicht erreichbar: ${this.ipAddress}`);
        throw new Error('Gerät nicht erreichbar');
      } else {
        this.log.error(`Fehler beim Setzen der Target Position: ${error.message}`);
        throw error;
      }
    }
  }
}

module.exports = ShellyAPIClient;

