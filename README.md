# homebridge-shelly-trv

Homebridge Plugin für Shelly TRV Gen1 WLAN-Heizkörperthermostate

## Beschreibung

Dieses Plugin ermöglicht die Steuerung von Shelly TRV Gen1 Heizkörperthermostaten über Apple HomeKit via Homebridge. Sie können mehrere Ventile konfigurieren und diese direkt über die Home-App oder Siri steuern.

## Features

- **Temperatur-Sollwert einstellen**: Stellen Sie die gewünschte Temperatur über Apple Home ein
- **Aktuelle Temperatur anzeigen**: Sehen Sie die aktuelle Raumtemperatur in der Home-App
- **Ventil-Position/Status**: Der Heizstatus wird basierend auf der Ventilposition angezeigt
- **Mehrere Geräte**: Unterstützung für mehrere Shelly TRV Ventile
- **Automatische Aktualisierung**: Status wird regelmäßig automatisch aktualisiert
- **Alternative IP-Adresse**: Unterstützung für alternative IP-Adressen (z.B. bei Dual-Network-Setups)
- **Intelligenter Cache**: Reduziert Netzwerk-Traffic durch Caching
- **Request-Queue**: Verhindert Überlastung durch serielle Request-Abarbeitung

## Voraussetzungen

- Node.js >= 10.17.0
- Homebridge >= 1.0.0
- Shelly TRV Gen1 Geräte im lokalen Netzwerk
- Die IP-Adressen der Shelly TRV Geräte müssen bekannt sein

## Installation

1. Installieren Sie das Plugin über npm (oder kopieren Sie den Code in das Homebridge Plugins Verzeichnis):

```bash
npm install -g homebridge-shelly-trv
```

2. Konfigurieren Sie das Plugin in der Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "ShellyTRV",
      "name": "Shelly TRV",
      "devices": [
        {
          "name": "Wohnzimmer Ventil",
          "ip": "192.168.1.100"
        },
        {
          "name": "Schlafzimmer Ventil",
          "ip": "192.168.1.101"
        }
      ]
    }
  ]
}
```

3. Starten Sie Homebridge neu.

## Konfiguration

### Platform Name
Der Name der Platform in Homebridge (standardmäßig "Shelly TRV").

### Devices
Eine Liste von Shelly TRV Geräten mit folgenden Eigenschaften:

- **name**: Der Name, der in Apple Home angezeigt wird
- **ip**: Die IP-Adresse des Shelly TRV Geräts im lokalen Netzwerk (IPv4)
- **alternativeIp** (optional): Alternative IP-Adresse für das Gerät. Wenn konfiguriert, werden Temperaturänderungen an beide IP-Adressen gesendet. Nützlich bei Dual-Network-Setups oder wenn das Gerät über mehrere Netzwerke erreichbar ist.

### Beispiel-Konfiguration

```json
{
  "platform": "ShellyTRV",
  "name": "Shelly TRV",
  "devices": [
    {
      "name": "Wohnzimmer Heizung",
      "ip": "192.168.1.100"
    },
    {
      "name": "Schlafzimmer Heizung",
      "ip": "192.168.1.101"
    },
    {
      "name": "Küche Heizung",
      "ip": "192.168.1.102",
      "alternativeIp": "192.168.2.102"
    }
  ]
}
```

### Alternative IP-Adresse

Wenn ein Gerät über mehrere Netzwerke erreichbar ist (z.B. WLAN und LAN), können Sie eine alternative IP-Adresse konfigurieren. Beim Setzen der Temperatur werden dann beide IP-Adressen angesprochen:

```json
{
  "name": "Wohnzimmer Heizung",
  "ip": "192.168.1.100",
  "alternativeIp": "192.168.2.100"
}
```

**Hinweis**: 
- Die alternative IP ist optional
- Status-Abfragen erfolgen nur über die Haupt-IP (`ip`)
- Temperaturänderungen werden an beide IPs gesendet
- Fehler bei der alternativen IP werden geloggt, führen aber nicht zum Abbruch

## Funktionen

### HomeKit Thermostat Service

Jedes Shelly TRV Gerät wird als Thermostat in Apple Home dargestellt mit folgenden Funktionen:

- **Solltemperatur**: Temperatur zwischen 5°C und 35°C einstellen (Schritte: 0.5°C)
- **Aktuelle Temperatur**: Anzeige der gemessenen Raumtemperatur
- **Heizstatus**: Anzeige ob das Ventil geöffnet ist (Heizung an) oder geschlossen (Heizung aus)
- **Ein/Aus**: Möglichkeit das Ventil komplett zu schließen oder zu öffnen

### API-Endpunkte

Das Plugin nutzt folgende Shelly TRV Gen1 API-Endpunkte:

- `GET http://<IP>/status` - Status abrufen (Temperatur, Ventilposition)
- `GET http://<IP>/settings` - Einstellungen abrufen
- `POST http://<IP>/settings?target_pos=<value>` - Zielposition setzen (0-100%)

Die Zielposition (target_pos) wird automatisch in eine Temperatur umgewandelt:
- 0% = 5°C (Ventil geschlossen)
- 100% = 35°C (Ventil vollständig geöffnet)

## Troubleshooting

### Gerät nicht erreichbar

- Stellen Sie sicher, dass die IP-Adresse korrekt ist
- Überprüfen Sie, ob das Shelly TRV Gerät im gleichen Netzwerk wie Homebridge ist
- Prüfen Sie die Verbindung mit einem Browser: `http://<IP>/status`

### Temperatur wird nicht angezeigt

- Überprüfen Sie die Homebridge Logs auf Fehlermeldungen
- Stellen Sie sicher, dass das Shelly TRV Gerät korrekt funktioniert
- Prüfen Sie die API-Verfügbarkeit direkt: `http://<IP>/status`

### Logs

Aktivieren Sie Debug-Logs in Homebridge, um detaillierte Informationen zu erhalten:

```bash
homebridge -D
```

## Entwicklung

```bash
# Abhängigkeiten installieren
npm install

# Plugin lokal testen
npm link
```

## Lizenz

ISC

## Unterstützung

Bei Problemen oder Fragen:
1. Überprüfen Sie die Homebridge Logs
2. Stellen Sie sicher, dass die IP-Adressen korrekt sind
3. Testen Sie die Shelly TRV API direkt mit einem Browser oder curl

## Referenzen

- [Shelly TRV Gen1 API Dokumentation](https://shelly-api-docs.shelly.cloud/gen1/#shelly-trv)
- [Homebridge Dokumentation](https://github.com/homebridge/homebridge)
- [HomeKit Accessory Protocol](https://developer.apple.com/homekit/)

