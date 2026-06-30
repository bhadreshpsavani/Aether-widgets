import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
import Pango from 'gi://Pango';

import { BaseWidget, getBool, getStr, getNum } from '../lib/base.js';

// WMO weather code → [emoji, description].
const WMO = {
    0: ['☀️', 'Clear'], 1: ['🌤️', 'Mainly clear'], 2: ['⛅', 'Partly cloudy'],
    3: ['☁️', 'Overcast'], 45: ['🌫️', 'Fog'], 48: ['🌫️', 'Rime fog'],
    51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌦️', 'Heavy drizzle'],
    61: ['🌧️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
    66: ['🌧️', 'Freezing rain'], 67: ['🌧️', 'Freezing rain'],
    71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['🌨️', 'Heavy snow'],
    77: ['🌨️', 'Snow grains'], 80: ['🌦️', 'Showers'], 81: ['🌦️', 'Showers'],
    82: ['🌧️', 'Violent showers'], 85: ['🌨️', 'Snow showers'], 86: ['🌨️', 'Snow showers'],
    95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm'], 99: ['⛈️', 'Thunderstorm'],
};

function describe(code) {
    return WMO[code] ?? ['🌡️', '—'];
}

export const WeatherWidget = GObject.registerClass(
class WeatherWidget extends BaseWidget {
    _build() {
        this._session = new Soup.Session();
        this._session.timeout = 15;

        this._placeLabel = this._label('aether-weather-location', '…');
        this.add_child(this._placeLabel);

        const row = new St.BoxLayout({ vertical: false });
        this._iconLabel = this._label('aether-weather-icon', '🌡️');
        this._tempLabel = this._label('aether-weather-temp', '--°');
        row.add_child(this._iconLabel);
        row.add_child(this._tempLabel);
        this.add_child(row);

        this._condLabel = this._label('aether-weather-cond', 'Loading…');
        this.add_child(this._condLabel);
        this._hiloLabel = this._label('aether-weather-hilo', '');
        this.add_child(this._hiloLabel);

        this._placeLabel.set_style(`color: ${this.accent};`);

        this._startLocation();
        // Refresh every 15 minutes.
        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, 900, () => { this._fetchWeather(); return GLib.SOURCE_CONTINUE; });
    }

    _label(cls, text) {
        const l = new St.Label({ style_class: cls, text });
        l.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        return l;
    }

    _startLocation() {
        const auto = this._settings ? getBool(this._settings, 'weather-auto-location', true) : true;
        if (auto) {
            this._getJson('https://ipapi.co/json/', (data) => {
                if (data && data.latitude && data.longitude) {
                    this._lat = data.latitude;
                    this._lon = data.longitude;
                    this._place = data.city || 'Here';
                } else {
                    this._useSettingsLocation();
                }
                this._fetchWeather();
            });
        } else {
            this._useSettingsLocation();
            this._fetchWeather();
        }
    }

    _useSettingsLocation() {
        this._lat = this._settings ? getNum(this._settings, 'weather-latitude', 23.03) : 23.03;
        this._lon = this._settings ? getNum(this._settings, 'weather-longitude', 72.58) : 72.58;
        this._place = this._settings ? getStr(this._settings, 'weather-location', 'Ahmedabad') : 'Ahmedabad';
    }

    _fetchWeather() {
        if (this._lat == null || this._lon == null) return;
        const unit = this._settings ? getStr(this._settings, 'weather-unit', 'celsius') : 'celsius';
        const tempUnit = unit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
        const url = 'https://api.open-meteo.com/v1/forecast' +
            `?latitude=${this._lat}&longitude=${this._lon}` +
            '&current=temperature_2m,weather_code' +
            '&daily=temperature_2m_max,temperature_2m_min' +
            `&timezone=auto&temperature_unit=${tempUnit}`;

        this._getJson(url, (data) => {
            if (!data || !data.current) {
                this._condLabel.set_text('Unavailable');
                return;
            }
            const [icon, desc] = describe(data.current.weather_code);
            const t = Math.round(data.current.temperature_2m);
            this._placeLabel.set_text((this._place || '').toUpperCase());
            this._iconLabel.set_text(icon);
            this._tempLabel.set_text(`${t}°`);
            this._condLabel.set_text(desc);
            if (data.daily) {
                const hi = Math.round(data.daily.temperature_2m_max[0]);
                const lo = Math.round(data.daily.temperature_2m_min[0]);
                this._hiloLabel.set_text(`H:${hi}°  L:${lo}°`);
            }
        });
    }

    _getJson(url, cb) {
        try {
            const msg = Soup.Message.new('GET', url);
            this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (sess, res) => {
                try {
                    const bytes = sess.send_and_read_finish(res);
                    const text = new TextDecoder().decode(bytes.get_data());
                    cb(JSON.parse(text));
                } catch (e) {
                    console.warn(`[Aether] weather request failed: ${e.message}`);
                    cb(null);
                }
            });
        } catch (e) {
            console.warn(`[Aether] weather: ${e.message}`);
            cb(null);
        }
    }

    destroy() {
        this._session?.abort();
        this._session = null;
        super.destroy();
    }
});
