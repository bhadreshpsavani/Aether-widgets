import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';

import { BaseWidget } from '../lib/base.js';
import { makeRow, makeIcon, setRow } from '../lib/meter.js';

const MIN_FS_BYTES = 2 * 1e9; // hide partitions under 2 GB (/boot/efi etc.)

// Disks fill slowly — warn later than CPU/GPU load.
function storageColor(pct) {
    if (pct >= 90) return '#f87171';
    if (pct >= 75) return '#fbbf24';
    return '#4ade80';
}

function labelFor(mount) {
    if (mount === '/') return 'Root';
    const parts = mount.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : mount;
}

function scanMounts() {
    const out = [];
    const seen = new Set();
    try {
        const [ok, bytes] = GLib.file_get_contents('/proc/mounts');
        if (!ok) return out;
        for (const line of new TextDecoder().decode(bytes).split('\n')) {
            if (!line) continue;
            const [dev, rawMount, fstype] = line.split(' ');
            if (!dev || !rawMount) continue;
            if (!dev.startsWith('/dev/') || dev.startsWith('/dev/loop')) continue;
            if (fstype === 'squashfs') continue;
            const mount = rawMount.replace(/\\040/g, ' ').replace(/\\011/g, '\t');
            if (seen.has(mount)) continue;
            seen.add(mount);
            out.push({ mount, label: labelFor(mount) });
        }
    } catch (_e) {}
    return out;
}

function usageOf(mount) {
    try {
        const info = Gio.File.new_for_path(mount).query_filesystem_info(
            'filesystem::size,filesystem::free', null);
        const size = info.get_attribute_uint64('filesystem::size');
        const free = info.get_attribute_uint64('filesystem::free');
        if (!size || size < MIN_FS_BYTES) return null;
        const used = size - free;
        return { pct: 100 * used / size, usedGB: used / 1e9, totalGB: size / 1e9 };
    } catch (_e) {
        return null;
    }
}

export const StorageWidget = GObject.registerClass(
class StorageWidget extends BaseWidget {
    _build() {
        const title = new St.Label({ style_class: 'aether-sysmon-title', text: 'STORAGE' });
        title.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        title.set_style(`color: ${this.accent};`);
        this.add_child(title);

        this._rows = new Map();
        this._refresh();
        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, 15, () => { this._refresh(); return GLib.SOURCE_CONTINUE; });
    }

    _refresh() {
        const mounts = scanMounts();
        const live = new Set();

        for (const { mount, label } of mounts) {
            const usage = usageOf(mount);
            if (!usage) continue;
            live.add(mount);

            let row = this._rows.get(mount);
            if (!row) {
                row = makeRow(label, makeIcon(this._path, 'drive'));
                this.add_child(row.container);
                this._rows.set(mount, row);
            }
            setRow(row, {
                text: `${Math.round(usage.usedGB)}/${Math.round(usage.totalGB)}G`,
                fraction: usage.pct / 100,
                color: storageColor(usage.pct),
            });
        }

        for (const [mount, row] of this._rows) {
            if (!live.has(mount)) {
                row.container.destroy();
                this._rows.delete(mount);
            }
        }
    }
});
