import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

export const BAR_WIDTH = 196;
export const BAR_HEIGHT = 6;

/** Load colour: green → amber → red. */
export function loadColor(pct) {
    if (pct >= 85) return '#f87171';
    if (pct >= 60) return '#fbbf24';
    return '#4ade80';
}

/** Build a small line-icon from the extension's icons/ folder. */
export function makeIcon(path, name, size = 14) {
    if (!path) return null;
    const file = GLib.build_filenamev([path, 'icons', `${name}.svg`]);
    return new St.Icon({
        gicon: Gio.icon_new_for_string(file),
        icon_size: size,
        style_class: 'aether-row-icon',
        y_align: Clutter.ActorAlign.CENTER,
    });
}

/** Build a labelled row with optional leading icon and a progress bar. */
export function makeRow(label, icon = null) {
    const container = new St.BoxLayout({
        style_class: 'aether-sysmon-row',
        vertical: true,
    });

    const header = new St.BoxLayout({ vertical: false });
    if (icon) header.add_child(icon);

    const nameLabel = new St.Label({
        style_class: 'aether-sysmon-label',
        text: label,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    nameLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    const valueLabel = new St.Label({
        style_class: 'aether-sysmon-value',
        text: '--',
        x_align: Clutter.ActorAlign.END,
        y_align: Clutter.ActorAlign.CENTER,
    });
    valueLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    header.add_child(nameLabel);
    header.add_child(valueLabel);
    container.add_child(header);

    const track = new St.Widget({
        style_class: 'aether-bar-track',
        width: BAR_WIDTH,
        height: BAR_HEIGHT,
    });
    const fill = new St.Widget({
        style_class: 'aether-bar-fill',
        width: 0,
        height: BAR_HEIGHT,
    });
    track.add_child(fill);
    container.add_child(track);

    return { container, nameLabel, valueLabel, fill };
}

/** Update a row: set text + colour now, animate the bar to its new width. */
export function setRow(row, { text, fraction, color }) {
    row.valueLabel.set_text(text);
    const f = Math.max(0, Math.min(1, fraction));
    row.fill.set_style(`background-color: ${color};`);
    row.fill.remove_all_transitions();
    row.fill.ease({
        width: Math.round(f * BAR_WIDTH),
        duration: 500,
        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
    });
}

/** Convenience: update a row from a percentage using the load palette. */
export function setPct(row, pct) {
    const c = Math.max(0, Math.min(100, pct));
    setRow(row, { text: `${c.toFixed(0)}%`, fraction: c / 100, color: loadColor(c) });
}
