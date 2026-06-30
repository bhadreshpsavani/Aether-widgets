import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class WidgetRegistry {
    constructor({ settings, path }) {
        this._settings = settings;
        this._path = path;
        this._classes = new Map();
        this._mounted = new Map();
        this._editMode = false;
    }

    register(id, WidgetClass) {
        this._classes.set(id, WidgetClass);
    }

    get editMode() {
        return this._editMode;
    }

    /**
     * Locked  : widgets live in the wallpaper layer (_backgroundGroup) — behind
     *           windows, not interactive (the desktop-icons window eats clicks).
     * Editing : widgets are promoted to shell chrome (addChrome) — above windows
     *           and inside the shell's input region, so they can be dragged.
     */
    toggleEditMode() {
        this.setEditMode(!this._editMode);
        return this._editMode;
    }

    setEditMode(on) {
        if (on === this._editMode) return;
        this._editMode = on;

        for (const widget of this._mounted.values()) {
            const x = widget.x, y = widget.y;
            if (on) {
                Main.layoutManager._backgroundGroup.remove_child(widget);
                Main.layoutManager.addChrome(widget);
            } else {
                Main.layoutManager.removeChrome(widget);
                Main.layoutManager._backgroundGroup.add_child(widget);
            }
            widget.setEditable(on);
            widget.set_position(x, y);
            if (!on) widget._savePosition();
        }
    }

    /** Tear down all mounted widgets and re-create from current settings. */
    remountAll() {
        if (this._editMode) this.setEditMode(false);
        for (const id of [...this._mounted.keys()])
            this.unmount(id);
        this.mountAll();
    }

    mount(id) {
        if (this._mounted.has(id)) return;
        const WidgetClass = this._classes.get(id);
        if (!WidgetClass) {
            console.warn(`[Aether] Unknown widget: ${id}`);
            return;
        }

        try {
            const widget = new WidgetClass({ id, settings: this._settings, path: this._path });

            let x = 80, y = 80;
            try {
                x = this._settings.get_int(`${id}-x`);
                y = this._settings.get_int(`${id}-y`);
            } catch (_e) {
                console.warn(`[Aether] No position keys for "${id}" — using defaults`);
            }
            widget.set_position(x, y);

            Main.layoutManager._backgroundGroup.add_child(widget);
            this._mounted.set(id, widget);
        } catch (e) {
            console.error(`[Aether] Failed to mount widget "${id}": ${e.message}`);
        }
    }

    mountAll() {
        let enabledIds;
        try {
            enabledIds = this._settings.get_strv('enabled-widgets');
        } catch (_e) {
            enabledIds = [...this._classes.keys()];
        }

        for (const id of enabledIds) {
            if (this._classes.has(id))
                this.mount(id);
        }
    }

    unmount(id) {
        const widget = this._mounted.get(id);
        if (widget) {
            if (this._editMode)
                Main.layoutManager.removeChrome(widget);
            else
                Main.layoutManager._backgroundGroup.remove_child(widget);
            widget.destroy();
            this._mounted.delete(id);
        }
    }

    destroy() {
        for (const id of [...this._mounted.keys()])
            this.unmount(id);
        this._classes.clear();
        this._editMode = false;
    }
}
