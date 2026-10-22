import Clutter from 'gi://Clutter';
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import * as Config from "resource:///org/gnome/shell/misc/config.js";

const SHELL_MAJOR = parseInt(Config.PACKAGE_VERSION.split('.')[0]);

// GNOME 48 replaced St.BoxLayout's `vertical` property with `orientation`,
// and GNOME 51 removed `vertical` entirely (constructing with it throws).
// Spread into St.BoxLayout params: new St.BoxLayout({ ...VERTICAL, ... }).
export const VERTICAL = SHELL_MAJOR >= 48
    ? { orientation: Clutter.Orientation.VERTICAL }
    : { vertical: true };

// GNOME 51 changed PopupMenu open()/close() from a BoxPointer.PopupAnimation
// argument to a params object: menu.close(popupAnimation(false)).
export function popupAnimation(animate) {
    if (SHELL_MAJOR >= 51)
        return { animate };
    return animate ? BoxPointer.PopupAnimation.FULL : BoxPointer.PopupAnimation.NONE;
}
