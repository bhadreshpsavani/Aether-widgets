# Aether Widgets

A modern, open-source **widget library for the GNOME Shell** (GNOME 48–50,
i.e. Ubuntu 24.04+ through 26.04). Written in GJS — the only language that
runs natively inside the Shell process.

It ships two example widgets (clock, system monitor) and a small framework
(`BaseWidget` + `WidgetRegistry`) so others can contribute new widgets with
minimal boilerplate.

> **Note — GPU monitoring:** The system monitor widget reads AMD-specific
> sysfs files (`gpu_busy_percent`). The GPU card index is auto-detected at
> runtime. NVIDIA and Intel GPUs are not currently supported; the GPU row
> will show `--` on unsupported hardware.

## Why GJS and not Rust/GTK4

GNOME Shell extensions execute *inside* `gnome-shell` and must be JavaScript.
There is no way to run Rust there. If you want anchored desktop widgets in
Rust, you need standalone GTK4 + `gtk4-layer-shell` apps — but stock
Mutter/GNOME on Ubuntu does not expose `wlr-layer-shell` to third parties,
so those won't anchor to the desktop. For GNOME-targeted widgets, GJS is the
correct tool.

## Project layout

```
aether-widgets/
├── extension.js        # entry point: enable()/disable()
├── metadata.json       # UUID, shell-version, schema
├── stylesheet.css      # the "modern look"
├── .gitignore
├── LICENSE             # MIT
├── lib/
│   ├── base.js         # BaseWidget — subclass this
│   └── registry.js     # mount/unmount widgets onto the panel
├── widgets/
│   ├── clock.js
│   └── sysmon.js
└── schemas/            # GSettings schema (compile before publishing)
```

## Develop & test

```bash
# Symlink into the user extensions dir
ln -s "$PWD" ~/.local/share/gnome-shell/extensions/[email protected]

# Compile settings schema (once, and after schema edits)
glib-compile-schemas schemas/

# Reload: log out / back in on Wayland (Alt+F2 → r only works on X11)
gnome-extensions enable [email protected]

# Live logs while you iterate
journalctl -f -o cat /usr/bin/gnome-shell
```

## Write a new widget

```js
import GObject from 'gi://GObject';
import St from 'gi://St';
import { BaseWidget } from '../lib/base.js';

export const HelloWidget = GObject.registerClass(
class HelloWidget extends BaseWidget {
    _build() {
        this.add_child(new St.Label({ text: 'Hello' }));
    }
});
```

Then register it in `extension.js`:

```js
this._registry.register('hello', HelloWidget);
```

## License

MIT — see LICENSE.
