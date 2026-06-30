import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';

import { BaseWidget } from '../lib/base.js';

export const ClockWidget = GObject.registerClass(
class ClockWidget extends BaseWidget {
    _build() {
        this._dowLabel = this._label('aether-clock-dow');
        this._dowLabel.set_style(`color: ${this.accent};`);
        this.add_child(this._dowLabel);

        this._timeLabel = this._label('aether-clock-time');
        this.add_child(this._timeLabel);

        this._dateLabel = this._label('aether-clock-date');
        this.add_child(this._dateLabel);

        this._refresh();
        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, 30, () => { this._refresh(); return GLib.SOURCE_CONTINUE; });
    }

    _label(cls) {
        const l = new St.Label({ style_class: cls });
        l.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        return l;
    }

    _refresh() {
        const now = GLib.DateTime.new_now_local();
        this._dowLabel.set_text(now.format('%A').toUpperCase());
        this._timeLabel.set_text(now.format('%H:%M'));
        this._dateLabel.set_text(now.format('%e %B %Y'));
    }
});
