import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import { BaseWidget } from '../lib/base.js';
import { makeIcon } from '../lib/meter.js';

const SKIP_PREFIXES = ['lo', 'lxc', 'docker', 'veth', 'br-', 'virbr', 'tun', 'tap', 'wg', 'vmnet', 'vnet'];

function isPhysical(iface) {
    return !SKIP_PREFIXES.some(p => iface === p || iface.startsWith(p));
}

function fmtSpeed(bps) {
    if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
    if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
    return `${Math.round(bps)} B/s`;
}

function readBytes() {
    try {
        const [ok, bytes] = GLib.file_get_contents('/proc/net/dev');
        if (!ok) return null;
        let rx = 0, tx = 0;
        for (const line of new TextDecoder().decode(bytes).split('\n')) {
            const colon = line.indexOf(':');
            if (colon < 0) continue;
            const iface = line.slice(0, colon).trim();
            if (!isPhysical(iface)) continue;
            const s = line.slice(colon + 1).trim().split(/\s+/).map(Number);
            rx += s[0] || 0;
            tx += s[8] || 0;
        }
        return { rx, tx };
    } catch (_e) {
        return null;
    }
}

export const NetworkWidget = GObject.registerClass(
class NetworkWidget extends BaseWidget {
    _build() {
        const title = new St.Label({ style_class: 'aether-sysmon-title', text: 'NETWORK' });
        title.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        title.set_style(`color: ${this.accent};`);
        this.add_child(title);

        this._downValue = this._makeRow('download');
        this._upValue = this._makeRow('upload');

        this._prev = readBytes();
        this._prevTime = GLib.get_monotonic_time();
        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, 1, () => { this._refresh(); return GLib.SOURCE_CONTINUE; });
    }

    _makeRow(iconName) {
        const box = new St.BoxLayout({ style_class: 'aether-net-row', vertical: false });
        const icon = makeIcon(this._path, iconName, 18);
        if (icon) box.add_child(icon);
        const value = new St.Label({
            style_class: 'aether-net-value',
            text: '--',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });
        value.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        box.add_child(value);
        this.add_child(box);
        return value;
    }

    _refresh() {
        const cur = readBytes();
        const now = GLib.get_monotonic_time();
        if (this._prev && cur) {
            const dt = (now - this._prevTime) / 1e6;
            if (dt > 0) {
                this._downValue.set_text(fmtSpeed(Math.max(0, (cur.rx - this._prev.rx) / dt)));
                this._upValue.set_text(fmtSpeed(Math.max(0, (cur.tx - this._prev.tx) / dt)));
            }
        }
        this._prev = cur;
        this._prevTime = now;
    }
});
