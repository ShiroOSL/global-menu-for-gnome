#!@GJS@ -m
/*
 * systemInfoPanel.js - Standalone GTK4 hardware/OS summary window for
 * Global Menu's "About This System" item. Launched with
 * `gjs -m systemInfoPanel.js`. Reads hardware and OS details from /proc,
 * /sys and /etc/os-release locally; the More Info... button opens the
 * full GNOME Settings about panel.
 */

import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Pango from 'gi://Pango';

const CSS = `
label.globalmenu-sysinfo-title {
  font-size: 22px;
  font-weight: 700;
}
label.globalmenu-sysinfo-key {
  font-weight: 600;
}
label.globalmenu-sysinfo-value {
  font-weight: 500;
}
grid.globalmenu-sysinfo-grid label,
label.globalmenu-sysinfo-subtitle {
  font-size: 13px;
}
button.globalmenu-sysinfo-button {
  font-weight: 500;
  font-size: 13px;
  min-height: 0;
  padding: 4px 14px;
}
`;

// Device silhouette SVGs live in icons/PC/, one level up from this script.
const [scriptPath] = GLib.filename_from_uri(import.meta.url);
const ICONS_PC_DIR = GLib.build_filenamev([GLib.path_get_dirname(scriptPath), 'icons', 'PC']);

function readFileTrimmed(path) {
  try {
    const [ok, bytes] = GLib.file_get_contents(path);
    return ok ? new TextDecoder().decode(bytes).trim() : null;
  } catch {
    // Missing or unreadable (e.g. root-only DMI entries).
    return null;
  }
}

// Placeholder values some vendors leave in the DMI tables.
const DMI_PLACEHOLDER = /^(to be filled|system product name|system version|default string|none|unknown|not applicable|oem)/i;

function readDmiField(name) {
  const value = readFileTrimmed(`/sys/devices/virtual/dmi/id/${name}`);
  return value && !DMI_PLACEHOLDER.test(value) ? value : null;
}

// SMBIOS chassis types describing portable machines (laptop, notebook, tablet, ...).
const LAPTOP_CHASSIS_TYPES = new Set([8, 9, 10, 11, 14, 30, 31, 32]);

function isLaptopChassis() {
  const type = Number.parseInt(readFileTrimmed('/sys/devices/virtual/dmi/id/chassis_type'), 10);
  return LAPTOP_CHASSIS_TYPES.has(type);
}

function readCpuModel() {
  const contents = readFileTrimmed('/proc/cpuinfo');
  const model = contents?.match(/^model name\s*:\s*(.+)$/m)?.[1];
  if (!model) {
    return null;
  }

  return model
    .replace(/\((?:R|TM|C)\)/gi, '')
    .replace(/\s*CPU\s*@\s*[\d.]+\s*[GM]Hz/i, '')
    .replace(/\s+(?:w\/|with)\s+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function readMemory() {
  const contents = readFileTrimmed('/proc/meminfo');
  const kb = Number.parseInt(contents?.match(/^MemTotal:\s+(\d+)\s+kB/m)?.[1], 10);
  if (!kb) {
    return null;
  }
  return `${Math.round(kb / 1048576)} GB`;
}

function readOsRelease() {
  const fields = {};
  const contents = readFileTrimmed('/etc/os-release') ?? '';
  for (const line of contents.split('\n')) {
    const match = line.match(/^(\w+)="?([^"]*)"?$/);
    if (match) {
      fields[match[1]] = match[2];
    }
  }
  return fields;
}

// GNOME Shell version, read from its D-Bus property (canonical source,
// no subprocess). Returns null off GNOME so the row is simply omitted.
function readDesktopVersion() {
  try {
    const reply = Gio.DBus.session.call_sync(
      'org.gnome.Shell',
      '/org/gnome/Shell',
      'org.freedesktop.DBus.Properties',
      'Get',
      new GLib.Variant('(ss)', ['org.gnome.Shell', 'ShellVersion']),
      null,
      Gio.DBusCallFlags.NONE,
      -1,
      null
    );
    const [version] = reply.recursiveUnpack();
    return version ? `GNOME ${version}` : null;
  } catch {
    return null;
  }
}

function buildWindow(application) {
  // Gtk.ApplicationWindow (not Adw): AdwApplicationWindow enforces a 360px
  // minimum width, which is wider than this compact panel needs.
  const window = new Gtk.ApplicationWindow({
    application,
    title: 'About This PC',
    default_width: 280,
    default_height: 480,
    resizable: false,
  });

  const provider = new Gtk.CssProvider();
  provider.load_from_string(CSS);
  Gtk.StyleContext.add_provider_for_display(
    Gdk.Display.get_default(),
    provider,
    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
  );

  const osRelease = readOsRelease();

  const deviceSvg = isLaptopChassis() ? 'laptop.svg' : 'desktop.svg';
  const imageFile = Gio.File.new_for_path(
    GLib.build_filenamev([ICONS_PC_DIR, deviceSvg])
  );
  const image = new Gtk.Image({
    gicon: new Gio.FileIcon({ file: imageFile }),
    pixel_size: 180,
  });

  const modelName = (
    readDmiField('product_family') ??
    readDmiField('product_name') ??
    readDmiField('product_version') ??
    GLib.get_host_name()
  ).replace(/\s*\([^)]*\)/g, '').trim();

  const titleLabel = new Gtk.Label({
    label: modelName || GLib.get_host_name(),
    ellipsize: Pango.EllipsizeMode.END,
    max_width_chars: 20,
    margin_top: 0,
  });
  titleLabel.add_css_class('globalmenu-sysinfo-title');

  const osName = [osRelease.NAME, osRelease.VERSION_ID].filter(Boolean).join(' ');
  const details = [
    ['Chip', readCpuModel()],
    ['Memory', readMemory()],
    ['Desktop', readDesktopVersion()],
    ['OS', osName || 'Linux'],
  ].filter(([, value]) => value);

  const grid = new Gtk.Grid({
    row_spacing: 4,
    column_spacing: 10,
    halign: Gtk.Align.CENTER,
    margin_top: 20,
  });
  grid.add_css_class('globalmenu-sysinfo-grid');
  details.forEach(([key, value], row) => {
    const keyLabel = new Gtk.Label({ label: key, xalign: 1 });
    keyLabel.add_css_class('globalmenu-sysinfo-key');
    const valueLabel = new Gtk.Label({
      label: value,
      xalign: 0,
      ellipsize: Pango.EllipsizeMode.END,
      max_width_chars: 28,
    });
    valueLabel.add_css_class('dim-label');
    valueLabel.add_css_class('globalmenu-sysinfo-value');
    grid.attach(keyLabel, 0, row, 1, 1);
    grid.attach(valueLabel, 1, row, 1, 1);
  });

  const moreInfoButton = new Gtk.Button({
    label: 'More Info...',
    halign: Gtk.Align.CENTER,
    margin_top: 20,
  });
  moreInfoButton.add_css_class('pill');
  moreInfoButton.add_css_class('globalmenu-sysinfo-button');
  moreInfoButton.connect('clicked', () => {
    try {
      Gio.Subprocess.new(['gnome-control-center', 'about'], Gio.SubprocessFlags.NONE);
    } catch (error) {
      logError(error, 'Failed to open GNOME Settings about panel');
    }
  });

  const content = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    margin_top: 12,
    margin_bottom: 28,
    margin_start: 28,
    margin_end: 28,
  });
  content.append(image);
  content.append(titleLabel);
  const vendor = readDmiField('sys_vendor');
  if (vendor) {
    const subtitleLabel = new Gtk.Label({ label: vendor, margin_top: 4 });
    subtitleLabel.add_css_class('dim-label');
    subtitleLabel.add_css_class('globalmenu-sysinfo-subtitle');
    content.append(subtitleLabel);
  }
  content.append(grid);
  content.append(moreInfoButton);

  // GTK4 has no API to disable a single titlebar button, so drop minimize
  // from the system decoration layout; maximize is hidden by resizable: false.
  const baseLayout = Gtk.Settings.get_default()?.gtk_decoration_layout ?? 'icon:close';
  const decorationLayout = baseLayout
    .split(':')
    .map((side) => side.split(',').filter((btn) => btn !== 'minimize').join(','))
    .join(':');

  const headerBar = new Adw.HeaderBar({
    decoration_layout: decorationLayout,
    show_title: false,
  });
  headerBar.add_css_class('flat');
  window.set_titlebar(headerBar);
  window.set_child(content);

  return window;
}

const application = new Adw.Application({
  application_id: 'io.github.ShiroOSL.GlobalMenu.SystemInfo',
});

let window = null;
application.connect('activate', () => {
  if (!window) {
    window = buildWindow(application);
  }
  window.present();
});

application.run(null);
