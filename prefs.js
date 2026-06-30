import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const WIDGETS = [
    ['clock', 'Clock'],
    ['sysmon', 'System monitor'],
    ['storage', 'Storage'],
    ['network', 'Network'],
    ['weather', 'Weather'],
];

const GPU_MODES = ['all', 'primary', 'off'];

function hexFromRgba(c) {
    const h = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${h(c.red)}${h(c.green)}${h(c.blue)}`;
}

export default class AetherPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        window.add(page);

        // ── Widgets ──────────────────────────────────────
        const widgetsGroup = new Adw.PreferencesGroup({
            title: 'Widgets',
            description: 'Choose which cards appear on the desktop',
        });
        page.add(widgetsGroup);

        for (const [id, title] of WIDGETS) {
            const row = new Adw.SwitchRow({ title });
            row.set_active(settings.get_strv('enabled-widgets').includes(id));
            row.connect('notify::active', () => {
                let list = settings.get_strv('enabled-widgets');
                if (row.active && !list.includes(id)) list.push(id);
                else if (!row.active) list = list.filter(x => x !== id);
                settings.set_strv('enabled-widgets', list);
            });
            widgetsGroup.add(row);
        }

        // ── Appearance ───────────────────────────────────
        const appGroup = new Adw.PreferencesGroup({ title: 'Appearance' });
        page.add(appGroup);

        const accentRow = new Adw.ActionRow({ title: 'Accent colour' });
        const rgba = new Gdk.RGBA();
        rgba.parse(settings.get_string('accent-color'));
        const colorBtn = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog(),
            rgba,
            valign: Gtk.Align.CENTER,
        });
        colorBtn.connect('notify::rgba', () => {
            settings.set_string('accent-color', hexFromRgba(colorBtn.get_rgba()));
        });
        accentRow.add_suffix(colorBtn);
        accentRow.activatable_widget = colorBtn;
        appGroup.add(accentRow);

        const opacityRow = new Adw.SpinRow({
            title: 'Card opacity',
            subtitle: 'Background transparency (0–1)',
            adjustment: new Gtk.Adjustment({
                lower: 0, upper: 1, step_increment: 0.05, page_increment: 0.1,
            }),
            digits: 2,
        });
        settings.bind('card-opacity', opacityRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        appGroup.add(opacityRow);

        // ── System monitor ───────────────────────────────
        const sysGroup = new Adw.PreferencesGroup({ title: 'System monitor' });
        page.add(sysGroup);

        const gpuRow = new Adw.ComboRow({
            title: 'GPU display',
            model: Gtk.StringList.new(['All GPUs', 'Primary only', 'Off']),
        });
        gpuRow.selected = Math.max(0, GPU_MODES.indexOf(settings.get_string('gpu-mode')));
        gpuRow.connect('notify::selected', () => {
            settings.set_string('gpu-mode', GPU_MODES[gpuRow.selected]);
        });
        sysGroup.add(gpuRow);

        const tempRow = new Adw.SwitchRow({ title: 'Show CPU temperature' });
        settings.bind('show-cpu-temp', tempRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        sysGroup.add(tempRow);

        const swapRow = new Adw.SwitchRow({ title: 'Show swap usage' });
        settings.bind('show-swap', swapRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        sysGroup.add(swapRow);

        // ── Weather ──────────────────────────────────────
        const wGroup = new Adw.PreferencesGroup({ title: 'Weather' });
        page.add(wGroup);

        const autoRow = new Adw.SwitchRow({
            title: 'Detect location automatically',
            subtitle: 'Uses your IP address',
        });
        settings.bind('weather-auto-location', autoRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        wGroup.add(autoRow);

        const unitRow = new Adw.ComboRow({
            title: 'Temperature unit',
            model: Gtk.StringList.new(['Celsius', 'Fahrenheit']),
        });
        const units = ['celsius', 'fahrenheit'];
        unitRow.selected = Math.max(0, units.indexOf(settings.get_string('weather-unit')));
        unitRow.connect('notify::selected', () => {
            settings.set_string('weather-unit', units[unitRow.selected]);
        });
        wGroup.add(unitRow);

        const placeRow = new Adw.EntryRow({ title: 'Location name' });
        settings.bind('weather-location', placeRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('weather-auto-location', placeRow, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);
        wGroup.add(placeRow);

        const latRow = new Adw.SpinRow({
            title: 'Latitude',
            adjustment: new Gtk.Adjustment({ lower: -90, upper: 90, step_increment: 0.1, page_increment: 1 }),
            digits: 2,
        });
        settings.bind('weather-latitude', latRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('weather-auto-location', latRow, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);
        wGroup.add(latRow);

        const lonRow = new Adw.SpinRow({
            title: 'Longitude',
            adjustment: new Gtk.Adjustment({ lower: -180, upper: 180, step_increment: 0.1, page_increment: 1 }),
            digits: 2,
        });
        settings.bind('weather-longitude', lonRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('weather-auto-location', lonRow, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);
        wGroup.add(lonRow);
    }
}
