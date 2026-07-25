import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';

import { BaseWidget, getBool, getStr } from '../lib/base.js';
import { makeRow, makeIcon, setRow, setPct, loadColor } from '../lib/meter.js';

const RE_MEM_TOTAL = /MemTotal:\s+(\d+)/;
const RE_MEM_AVAILABLE = /MemAvailable:\s+(\d+)/;
const RE_SWAP_TOTAL = /SwapTotal:\s+(\d+)/;
const RE_SWAP_FREE = /SwapFree:\s+(\d+)/;

const IGPU_VRAM_MAX = 512 * 1024 * 1024; // 512 MB → integrated
const CPU_TEMP_DRIVERS = ['k10temp', 'zenpower', 'coretemp', 'k8temp'];

function readSysFile(path) {
    if (!path) return null;
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        if (!ok) return null;
        const v = parseInt(new TextDecoder().decode(bytes).trim(), 10);
        return Number.isNaN(v) ? null : v;
    } catch (_e) {
        return null;
    }
}

function _detectGpus() {
    const found = [];
    try {
        const dir = GLib.Dir.open('/sys/class/drm', 0);
        const cards = [];
        let name;
        while ((name = dir.read_name()) !== null)
            if (/^card\d+$/.test(name)) cards.push(name);
        cards.sort();

        for (const card of cards) {
            const base = `/sys/class/drm/${card}/device`;
            if (!GLib.file_test(`${base}/gpu_busy_percent`, GLib.FileTest.EXISTS)) continue;
            const vram = readSysFile(`${base}/mem_info_vram_total`);
            found.push({
                base,
                busyPath: `${base}/gpu_busy_percent`,
                vramTotalPath: `${base}/mem_info_vram_total`,
                vramUsedPath: `${base}/mem_info_vram_used`,
                runtimeStatusPath: `${base}/power/runtime_status`,
                integrated: vram !== null && vram <= IGPU_VRAM_MAX,
                bootVga: readSysFile(`${base}/boot_vga`) === 1,
            });
        }
    } catch (_e) {}

    const discreteCount = found.filter(g => !g.integrated).length;
    let dIdx = 0, iIdx = 0;
    return found.map(g => {
        let label;
        if (g.integrated)
            label = found.filter(x => x.integrated).length > 1 ? `iGPU${++iIdx}` : 'iGPU';
        else
            label = discreteCount > 1 ? `GPU${++dIdx}` : 'GPU';
        return {
            base: g.base,
            busyPath: g.busyPath,
            vramTotalPath: g.vramTotalPath,
            vramUsedPath: g.vramUsedPath,
            runtimeStatusPath: g.runtimeStatusPath,
            label,
            bootVga: g.bootVga
        };
    });
}

function _detectCpuTempPath() {
    try {
        const dir = GLib.Dir.open('/sys/class/hwmon', 0);
        let n;
        while ((n = dir.read_name()) !== null) {
            const base = `/sys/class/hwmon/${n}`;
            let nm = null;
            try {
                const [ok, b] = GLib.file_get_contents(`${base}/name`);
                if (ok) nm = new TextDecoder().decode(b).trim();
            } catch (_e) {}
            if (nm && CPU_TEMP_DRIVERS.includes(nm)) {
                const p = `${base}/temp1_input`;
                if (GLib.file_test(p, GLib.FileTest.EXISTS)) return p;
            }
        }
    } catch (_e) {}
    return null;
}

const GPU_LIST = _detectGpus();
const CPU_TEMP_PATH = _detectCpuTempPath();

function tempColor(c) {
    if (c >= 80) return '#ff5c5c';
    if (c >= 60) return '#ffb43c';
    return '#46d39a';
}

export const SystemMonitorWidget = GObject.registerClass(
class SystemMonitorWidget extends BaseWidget {
    _build() {
        const title = new St.Label({ style_class: 'aether-sysmon-title', text: 'SYSTEM' });
        title.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        title.set_style(`color: ${this.accent};`);
        this.add_child(title);

        const add = (label, icon) => {
            const row = makeRow(label, makeIcon(this._path, icon));
            this.add_child(row.container);
            return row;
        };

        this._cpuRow = add('CPU', 'cpu');
        this._ramRow = add('RAM', 'ram');

        // Optional CPU temperature.
        const showTemp = this._settings ? getBool(this._settings, 'show-cpu-temp', true) : true;
        this._tempRow = (showTemp && CPU_TEMP_PATH) ? add('TEMP', 'temp') : null;

        // Optional swap (only if the system actually has swap).
        const showSwap = this._settings ? getBool(this._settings, 'show-swap', true) : true;
        this._swapRow = null;
        if (showSwap) {
            const sw = this._readSwap();
            if (sw && sw.total > 0) this._swapRow = add('SWAP', 'swap');
        }

        // GPUs, filtered by gpu-mode.
        const mode = this._settings ? getStr(this._settings, 'gpu-mode', 'all') : 'all';
        let gpus = GPU_LIST;
        if (mode === 'off') gpus = [];
        else if (mode === 'primary') {
            gpus = GPU_LIST.filter(g => g.bootVga);
            if (gpus.length === 0) gpus = GPU_LIST.slice(0, 1);
        }
        this._gpuRows = gpus.map(g => {
            const row = add(g.label, 'gpu');
            row.busyPath = g.busyPath;
            row.vramTotalPath = g.vramTotalPath;
            row.vramUsedPath = g.vramUsedPath;
            row.runtimeStatusPath = g.runtimeStatusPath;
            return row;
        });

        this._prev = this._readCpu();
        this._refresh();
        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, 2, () => { this._refresh(); return GLib.SOURCE_CONTINUE; });
    }

    _readCpu() {
        try {
            const [ok, bytes] = GLib.file_get_contents('/proc/stat');
            if (!ok) return null;
            const line = new TextDecoder().decode(bytes).split('\n')[0];
            const parts = line.trim().split(/\s+/).slice(1).map(Number);
            const idle = parts[3] + (parts[4] ?? 0);
            const total = parts.reduce((a, b) => a + b, 0);
            return { idle, total };
        } catch (_e) { return null; }
    }

    _readMem() {
        try {
            const [ok, bytes] = GLib.file_get_contents('/proc/meminfo');
            if (!ok) return null;
            const t = new TextDecoder().decode(bytes);
            const tot = t.match(RE_MEM_TOTAL), av = t.match(RE_MEM_AVAILABLE);
            return { total: tot ? +tot[1] : 0, available: av ? +av[1] : 0 };
        } catch (_e) { return null; }
    }

    _readSwap() {
        try {
            const [ok, bytes] = GLib.file_get_contents('/proc/meminfo');
            if (!ok) return null;
            const t = new TextDecoder().decode(bytes);
            const tot = t.match(RE_SWAP_TOTAL), free = t.match(RE_SWAP_FREE);
            return { total: tot ? +tot[1] : 0, free: free ? +free[1] : 0 };
        } catch (_e) { return null; }
    }

    _refresh() {
        const cur = this._readCpu();
        if (this._prev && cur) {
            const dTotal = cur.total - this._prev.total;
            const dIdle = cur.idle - this._prev.idle;
            const usage = dTotal > 0 ? (100 * (dTotal - dIdle) / dTotal) : 0;
            setPct(this._cpuRow, usage);
        }
        this._prev = cur;

        const mem = this._readMem();
        if (mem && mem.total > 0)
            setPct(this._ramRow, 100 * (mem.total - mem.available) / mem.total);

        if (this._tempRow) {
            const milli = readSysFile(CPU_TEMP_PATH);
            if (milli !== null) {
                const c = milli / 1000;
                setRow(this._tempRow, {
                    text: `${c.toFixed(0)}°C`,
                    fraction: (c - 30) / (95 - 30),
                    color: tempColor(c),
                });
            }
        }

        if (this._swapRow) {
            const sw = this._readSwap();
            if (sw && sw.total > 0)
                setPct(this._swapRow, 100 * (sw.total - sw.free) / sw.total);
        }

        for (const row of this._gpuRows) {
            let isSuspended = false;
            try {
                if (GLib.file_test(row.runtimeStatusPath, GLib.FileTest.EXISTS)) {
                    const [ok, bytes] = GLib.file_get_contents(row.runtimeStatusPath);
                    if (ok) {
                        const status = new TextDecoder().decode(bytes).trim();
                        if (status === 'suspended') {
                            isSuspended = true;
                        }
                    }
                }
            } catch (_e) {}

            if (isSuspended) {
                setRow(row, {
                    text: 'Suspended',
                    fraction: 0,
                    color: '#6b7280'
                });
                continue;
            }

            const busy = readSysFile(row.busyPath);
            const vramTotal = readSysFile(row.vramTotalPath);
            const vramUsed = readSysFile(row.vramUsedPath);

            if (busy !== null) {
                if (vramTotal && vramTotal > 0 && vramUsed !== null) {
                    const vramUsedGB = vramUsed / (1024 * 1024 * 1024);
                    const vramTotalGB = vramTotal / (1024 * 1024 * 1024);
                    setRow(row, {
                        text: `${busy.toFixed(0)}% (${vramUsedGB.toFixed(1)}/${vramTotalGB.toFixed(0)} GB)`,
                        fraction: busy / 100,
                        color: loadColor(busy)
                    });
                } else {
                    setPct(row, busy);
                }
            }
        }
    }
});
