import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import { WidgetRegistry } from './lib/registry.js';
import { ClockWidget } from './widgets/clock.js';
import { SystemMonitorWidget } from './widgets/sysmon.js';
import { StorageWidget } from './widgets/storage.js';
import { NetworkWidget } from './widgets/network.js';
import { WeatherWidget } from './widgets/weather.js';

// Config keys that should rebuild the widgets when changed (NOT positions).
const REMOUNT_KEYS = [
    'enabled-widgets', 'accent-color', 'card-opacity', 'gpu-mode',
    'show-cpu-temp', 'show-swap', 'weather-auto-location',
    'weather-latitude', 'weather-longitude', 'weather-location', 'weather-unit',
];

const AetherToggle = GObject.registerClass(
class AetherToggle extends PanelMenu.Button {
    _init(onToggle) {
        super._init(0.0, 'Aether Widgets');
        this._icon = new St.Icon({
            icon_name: 'changes-prevent-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(this._icon);
        this.connect('button-press-event', () => { onToggle(); return Clutter.EVENT_STOP; });
    }

    setEditing(on) {
        this._icon.icon_name = on ? 'changes-allow-symbolic' : 'changes-prevent-symbolic';
    }
});

export default class AetherWidgetsExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        this._registry = new WidgetRegistry({ settings: this._settings, path: this.path });
        this._registry.register('clock', ClockWidget);
        this._registry.register('sysmon', SystemMonitorWidget);
        this._registry.register('storage', StorageWidget);
        this._registry.register('network', NetworkWidget);
        this._registry.register('weather', WeatherWidget);
        this._registry.mountAll();

        this._toggle = new AetherToggle(() => this._onToggleEdit());
        Main.panel.addToStatusArea('aether-toggle', this._toggle, 0, 'right');

        Main.wm.addKeybinding(
            'toggle-edit-mode', this._settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._onToggleEdit());

        this._keyId = global.stage.connect('key-press-event', (_a, event) => {
            if (this._registry?.editMode && event.get_key_symbol() === Clutter.KEY_Escape) {
                this._onToggleEdit();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Rebuild widgets when configuration (not position) changes.
        this._settingIds = REMOUNT_KEYS.map(key =>
            this._settings.connect(`changed::${key}`, () => this._scheduleRemount()));
    }

    _scheduleRemount() {
        if (this._remountId) GLib.source_remove(this._remountId);
        this._remountId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
            this._remountId = 0;
            this._registry?.remountAll();
            this._toggle?.setEditing(false);
            this._hideBanner();
            return GLib.SOURCE_REMOVE;
        });
    }

    _onToggleEdit() {
        const editing = this._registry.toggleEditMode();
        this._toggle?.setEditing(editing);
        if (editing) this._showBanner();
        else this._hideBanner();
    }

    _showBanner() {
        if (this._banner) return;
        this._banner = new St.Label({
            style_class: 'aether-edit-banner',
            text: '✎  Edit mode — drag the widgets, then press Esc or click the panel lock to finish',
        });
        Main.layoutManager.addTopChrome(this._banner);
        const place = () => {
            const mon = Main.layoutManager.primaryMonitor;
            if (!mon || !this._banner) return;
            this._banner.set_position(
                mon.x + Math.round((mon.width - this._banner.width) / 2), mon.y + 64);
        };
        place();
        this._bannerId = this._banner.connect('notify::width', place);
    }

    _hideBanner() {
        if (!this._banner) return;
        if (this._bannerId) { this._banner.disconnect(this._bannerId); this._bannerId = null; }
        Main.layoutManager.removeChrome(this._banner);
        this._banner.destroy();
        this._banner = null;
    }

    disable() {
        if (this._remountId) { GLib.source_remove(this._remountId); this._remountId = 0; }
        if (this._settingIds) {
            for (const id of this._settingIds) this._settings.disconnect(id);
            this._settingIds = null;
        }
        this._hideBanner();
        if (this._keyId) { global.stage.disconnect(this._keyId); this._keyId = null; }
        Main.wm.removeKeybinding('toggle-edit-mode');
        this._toggle?.destroy();
        this._toggle = null;
        this._registry?.destroy();
        this._registry = null;
        this._settings = null;
    }
}
