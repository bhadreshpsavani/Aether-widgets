import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

// Safe settings readers — fall back if a key is missing (older compiled schema).
export function getStr(settings, key, fallback) {
    try { return settings.get_string(key); } catch (_e) { return fallback; }
}
export function getBool(settings, key, fallback) {
    try { return settings.get_boolean(key); } catch (_e) { return fallback; }
}
export function getNum(settings, key, fallback) {
    try { return settings.get_double(key); } catch (_e) { return fallback; }
}

export const BaseWidget = GObject.registerClass(
class BaseWidget extends St.BoxLayout {
    _init(opts = {}) {
        super._init({
            style_class: 'aether-card',
            reactive: true,
            track_hover: true,
            vertical: true,
        });
        this._id = opts.id;
        this._settings = opts.settings ?? null;
        this._path = opts.path ?? null;
        this._timeoutId = null;

        this._editable = false;
        this._dragging = false;
        this._dragGrab = null;

        this._applyAppearance();

        this.connect('button-press-event', this._onPress.bind(this));
        this.connect('motion-event', this._onMotion.bind(this));
        this.connect('button-release-event', this._onRelease.bind(this));

        this._build();
    }

    /** Accent colour from settings (used by subclasses for titles/highlights). */
    get accent() {
        return this._settings ? getStr(this._settings, 'accent-color', '#46d39a') : '#46d39a';
    }

    _applyAppearance() {
        if (!this._settings) return;
        const op = getNum(this._settings, 'card-opacity', 0.45);
        this.set_style(`background-color: rgba(0, 0, 0, ${op});`);
    }

    /** Toggle whether this card responds to drags (set by the registry). */
    setEditable(on) {
        this._editable = on;
        if (on) {
            this.add_style_class_name('edit-mode');
        } else {
            this._endDrag();
            this.remove_style_class_name('edit-mode');
        }
    }

    _onPress(_actor, event) {
        if (!this._editable || event.get_button() !== 1)
            return Clutter.EVENT_PROPAGATE;

        const [px, py] = global.get_pointer();
        this._dragStartX = px;
        this._dragStartY = py;
        this._dragOrigX = this.x;
        this._dragOrigY = this.y;
        this._dragging = true;
        this.add_style_class_name('dragging');
        this._dragGrab = global.stage.grab(this);
        return Clutter.EVENT_STOP;
    }

    _onMotion(_actor, _event) {
        if (!this._dragging) return Clutter.EVENT_PROPAGATE;
        const [px, py] = global.get_pointer();
        this.x = this._dragOrigX + (px - this._dragStartX);
        this.y = this._dragOrigY + (py - this._dragStartY);
        return Clutter.EVENT_STOP;
    }

    _onRelease(_actor, _event) {
        if (!this._dragging) return Clutter.EVENT_PROPAGATE;
        this._endDrag();
        this._savePosition();
        return Clutter.EVENT_STOP;
    }

    _endDrag() {
        if (this._dragGrab) {
            this._dragGrab.dismiss();
            this._dragGrab = null;
        }
        this._dragging = false;
        this.remove_style_class_name('dragging');
    }

    _savePosition() {
        if (!this._settings || !this._id) return;
        try {
            this._settings.set_int(`${this._id}-x`, this.x);
            this._settings.set_int(`${this._id}-y`, this.y);
        } catch (e) {
            console.warn(`[Aether] Failed to save position for "${this._id}": ${e.message}`);
        }
    }

    _build() {}

    _refresh() {}

    destroy() {
        this._endDrag();
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        super.destroy();
    }
});
