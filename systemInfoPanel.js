// Standalone window, started by systemMenu.js with `gjs -m systemInfoPanel.js`.
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Pango from 'gi://Pango';

const APP_ID = 'io.github.ShiroOSL.GlobalMenu.SystemInfo';
const WINDOW_WIDTH = 300;
const WINDOW_HEIGHT = 480;
const DEVICE_ICON_PX = 128;
const DMI_PREFIX = '/sys/devices/virtual/dmi/id/';
const PORTABLE_CODES = [8, 9, 10, 11, 14, 30, 31, 32];
const FIRMWARE_FILLER = [
    'to be filled', 'system product name', 'system version',
    'default string', 'none', 'unknown', 'not applicable', 'oem',
];

function readText(path) {
    try {
        const [, contents] = Gio.File.new_for_path(path).load_contents(null);
        return new TextDecoder().decode(contents).trim();
    } catch (_e) {
        return null;
    }
}

function firmwareValue(field) {
    const text = readText(DMI_PREFIX + field);
    if (!text)
        return null;

    const lower = text.toLowerCase();
    return FIRMWARE_FILLER.some(filler => lower.startsWith(filler)) ? null : text;
}

const isPortableMachine = () => PORTABLE_CODES.includes(Number(readText(`${DMI_PREFIX}chassis_type`)));

function machineName() {
    const raw = firmwareValue('product_family') ?? firmwareValue('product_name') ??
        firmwareValue('product_version') ?? GLib.get_host_name();
    return raw.replace(/\s*\([^)]*\)/g, '').trim() || GLib.get_host_name();
}

function tidyProcessorName(raw) {
    let name = raw.split('@')[0];
    for (const mark of ['(R)', '(r)', '(TM)', '(tm)', '(C)'])
        name = name.split(mark).join('');

    name = name.replace(/\b(?:CPU|Processor)\b/gi, ' ');
    const extra = name.search(/\s(?:with|w\/)\s/i);
    if (extra > 0)
        name = name.slice(0, extra);

    return name.split(/\s+/).filter(Boolean).join(' ');
}

function processorName() {
    const line = (readText('/proc/cpuinfo') ?? '').split('\n').find(l => l.startsWith('model name'));
    const raw = line?.slice(line.indexOf(':') + 1);
    return raw ? tidyProcessorName(raw) || null : null;
}

function memoryAmount() {
    const found = /MemTotal:\s*(\d+)/.exec(readText('/proc/meminfo') ?? '');
    return found ? `${Math.round(Number(found[1]) / 1024 / 1024)} GB` : null;
}

function storageAmount() {
    try {
        const info = Gio.File.new_for_path('/').query_filesystem_info('filesystem::size', null);
        const bytes = info.get_attribute_uint64('filesystem::size');
        return bytes > 0 ? GLib.format_size(bytes) : null;
    } catch (_e) {
        return null;
    }
}

function systemName() {
    return [GLib.get_os_info('NAME'), GLib.get_os_info('VERSION_ID')].filter(Boolean).join(' ') || 'Linux';
}

function desktopName() {
    try {
        const proxy = Gio.DBusProxy.new_for_bus_sync(
            Gio.BusType.SESSION,
            Gio.DBusProxyFlags.DO_NOT_CONNECT_SIGNALS | Gio.DBusProxyFlags.DO_NOT_AUTO_START,
            null, 'org.gnome.Shell', '/org/gnome/Shell', 'org.gnome.Shell', null);
        const version = proxy.get_cached_property('ShellVersion')?.unpack();
        return version ? `GNOME ${version}` : null;
    } catch (_e) {
        return null;
    }
}

function gatherDetails() {
    const candidates = [
        ['Processor', processorName()],
        ['Memory', memoryAmount()],
        ['Storage', storageAmount()],
        ['System', systemName()],
        ['Desktop', desktopName()],
    ];
    return candidates.filter(([, value]) => value).map(([label, value]) => ({label, value}));
}

function makeDeviceImage() {
    const iconFile = Gio.File.new_for_uri(import.meta.url).get_parent()
        .get_child('icons').get_child('PC')
        .get_child(isPortableMachine() ? 'laptop.svg' : 'desktop.svg');

    return new Gtk.Image({
        gicon: new Gio.FileIcon({file: iconFile}),
        pixel_size: DEVICE_ICON_PX,
        halign: Gtk.Align.CENTER,
    });
}

function makeHeading() {
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 2});

    const name = new Gtk.Label({
        label: machineName(),
        ellipsize: Pango.EllipsizeMode.END,
        max_width_chars: 22,
    });
    name.add_css_class('title-2');
    box.append(name);

    const maker = firmwareValue('sys_vendor');
    if (maker) {
        const makerLabel = new Gtk.Label({label: maker});
        makerLabel.add_css_class('dim-label');
        box.append(makerLabel);
    }
    return box;
}

function makeDetailsList(details) {
    const list = new Gtk.ListBox({selection_mode: Gtk.SelectionMode.NONE});
    list.add_css_class('boxed-list');

    for (const {label, value} of details) {
        const line = new Gtk.Box({
            spacing: 12,
            margin_top: 7,
            margin_bottom: 7,
            margin_start: 12,
            margin_end: 12,
        });

        const key = new Gtk.Label({label, xalign: 0});
        key.add_css_class('heading');

        const text = new Gtk.Label({
            label: value,
            xalign: 1,
            hexpand: true,
            ellipsize: Pango.EllipsizeMode.END,
            max_width_chars: 18,
            tooltip_text: value,
        });
        text.add_css_class('dim-label');

        line.append(key);
        line.append(text);
        list.append(new Gtk.ListBoxRow({child: line, activatable: false, selectable: false}));
    }
    return list;
}

function makeButtons(window, details) {
    const copy = new Gtk.Button({label: 'Copy Details'});
    copy.add_css_class('pill');
    copy.connect('clicked', () => {
        const lines = [machineName(), ...details.map(d => `${d.label}: ${d.value}`)];
        window.get_clipboard().set_text(lines.join('\n'));

        copy.set_label('Copied');
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1600, () => {
            copy.set_label('Copy Details');
            return GLib.SOURCE_REMOVE;
        });
    });

    const more = new Gtk.Button({label: 'More Info\u2026'});
    more.add_css_class('pill');
    more.connect('clicked', () => {
        try {
            Gio.Subprocess.new(['gnome-control-center', 'about'], Gio.SubprocessFlags.NONE);
        } catch (e) {
            logError(e, 'Could not open GNOME Settings');
        }
    });

    const row = new Gtk.Box({spacing: 10, halign: Gtk.Align.CENTER});
    row.append(copy);
    row.append(more);
    return row;
}

function makeHeaderBar() {
    const layout = (Gtk.Settings.get_default()?.gtk_decoration_layout ?? ':close')
        .split(':')
        .map(side => side.split(',').filter(button => button !== 'minimize').join(','))
        .join(':');

    const header = new Adw.HeaderBar({decoration_layout: layout, show_title: false});
    header.add_css_class('flat');
    return header;
}

function makeWindow(app) {
    const details = gatherDetails();

    // Adw.ApplicationWindow has a 360px minimum width, too wide for this panel
    const window = new Gtk.ApplicationWindow({
        application: app,
        title: 'About This System',
        default_width: WINDOW_WIDTH,
        default_height: WINDOW_HEIGHT,
        resizable: false,
    });

    const body = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 14,
        margin_top: 4,
        margin_bottom: 20,
        margin_start: 18,
        margin_end: 18,
    });
    body.append(makeDeviceImage());
    body.append(makeHeading());
    body.append(makeDetailsList(details));
    body.append(makeButtons(window, details));

    window.set_titlebar(makeHeaderBar());
    window.set_child(body);
    return window;
}

const app = new Adw.Application({application_id: APP_ID});
let mainWindow = null;

app.connect('activate', () => {
    mainWindow ??= makeWindow(app);
    mainWindow.present();
});

app.run(null);
