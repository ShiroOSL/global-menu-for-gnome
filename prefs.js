import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {COMMAND_PRESETS} from './utils.js';

const BIND = Gio.SettingsBindFlags.DEFAULT;
const KOFI_URL = 'https://ko-fi.com/shiro_osl';

const DISTRO_ICONS = [
    ['apple', 'Apple'], ['fedora', 'Fedora'], ['debian', 'Debian'], ['ubuntu', 'Ubuntu'],
    ['arch', 'Arch'], ['manjaro', 'Manjaro'], ['popos', 'Pop!_OS'], ['opensuse', 'openSUSE'],
    ['redhat', 'Red Hat'], ['gentoo', 'Gentoo'], ['freebsd', 'FreeBSD'], ['zorin', 'Zorin OS'],
    ['gnome', 'GNOME'],
];
const DISTRO_NAMES = new Map(DISTRO_ICONS);

const EXTENSION_APPS = [
    ['org.gnome.Extensions.desktop', 'GNOME Extensions'],
    ['com.mattjakeman.ExtensionManager.desktop', 'Extension Manager'],
];

const BUILTIN_MENUS = [
    ['menu-app-enabled', 'App Menu'],
    ['menu-file-enabled', 'File Menu'],
    ['menu-edit-enabled', 'Edit Menu'],
    ['menu-view-enabled', 'View Menu'],
    ['menu-go-enabled', 'Go Menu'],
    ['menu-window-enabled', 'Window Menu'],
    ['menu-help-enabled', 'Help Menu'],
];

const IMAGE_MIME_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/gif'];
const IMAGE_PATTERNS = ['*.svg', '*.png', '*.jpg', '*.jpeg', '*.webp', '*.bmp', '*.gif'];

const openUri = uri => Gio.AppInfo.launch_default_for_uri(uri, null);

function addSwitch(group, settings, key, title, subtitle) {
    const row = new Adw.SwitchRow(subtitle ? {title, subtitle} : {title});
    settings.bind(key, row, 'active', BIND);
    group.add(row);
    return row;
}

function entryRow(title, text, onChange) {
    const row = new Adw.EntryRow({title, text});
    row.connect('notify::text', () => onChange(row.text));
    return row;
}

function flatButton(iconName) {
    return new Gtk.Button({icon_name: iconName, valign: Gtk.Align.CENTER, css_classes: ['flat']});
}

function jsonList(settings, key) {
    return {
        load() {
            try {
                const data = JSON.parse(settings.get_string(key) || '[]');
                return Array.isArray(data) ? data : [];
            } catch (_e) {
                return [];
            }
        },
        save(data) {
            settings.set_string(key, JSON.stringify(data));
        },
    };
}

function addCommandRow(group, settings, title, enabledKey, commandKey, presets) {
    addSwitch(group, settings, enabledKey, title);

    const command = entryRow(`${title} Command`, settings.get_string(commandKey),
        text => settings.set_string(commandKey, text));
    group.add(command);

    const dropdown = new Gtk.DropDown({
        model: Gtk.StringList.new(['Presets\u2026', ...presets]),
        valign: Gtk.Align.CENTER,
    });
    dropdown.connect('notify::selected', () => {
        if (dropdown.selected === 0)
            return;
        command.text = presets[dropdown.selected - 1];
        dropdown.selected = 0;
    });
    command.add_suffix(dropdown);
}

function addIconPicker(group, settings, window, iconsDir) {
    const preview = new Gtk.Image({pixel_size: 32, margin_top: 6, margin_bottom: 6});
    const previewRow = new Adw.ActionRow({title: 'Current Icon'});
    previewRow.add_prefix(preview);
    group.add(previewRow);

    const symbolicRow = addSwitch(group, settings, 'logo-distro-icon-symbolic', 'Symbolic (single-color) Style');

    const sizeScale = new Gtk.Scale({
        orientation: Gtk.Orientation.HORIZONTAL,
        adjustment: new Gtk.Adjustment({lower: 12, upper: 48, step_increment: 1, page_increment: 4}),
        digits: 0,
        draw_value: true,
        hexpand: true,
        valign: Gtk.Align.CENTER,
    });
    sizeScale.set_size_request(220, -1);
    [12, 16, 22, 32, 48].forEach(mark => sizeScale.add_mark(mark, Gtk.PositionType.BOTTOM, null));
    sizeScale.set_value(settings.get_int('logo-icon-size'));

    const sizeRow = new Adw.ActionRow({title: 'Icon Size'});
    sizeRow.add_suffix(sizeScale);
    group.add(sizeRow);

    const variantPath = (stem, symbolic) => {
        for (const variant of symbolic ? ['symbolic', 'color'] : ['color', 'symbolic']) {
            const path = GLib.build_filenamev([iconsDir, `distro-${stem}-${variant}.svg`]);
            if (GLib.file_test(path, GLib.FileTest.EXISTS))
                return path;
        }
        return null;
    };

    const updatePreview = () => {
        preview.pixel_size = settings.get_int('logo-icon-size') || 32;

        const custom = settings.get_string('logo-custom-icon-path');
        const stem = settings.get_string('logo-distro-icon');
        const distroPath = stem && variantPath(stem, settings.get_boolean('logo-distro-icon-symbolic'));

        if (custom && GLib.file_test(custom, GLib.FileTest.EXISTS)) {
            preview.set_from_file(custom);
            previewRow.subtitle = 'Custom file';
        } else if (distroPath) {
            preview.set_from_file(distroPath);
            previewRow.subtitle = DISTRO_NAMES.get(stem) ?? stem;
        } else {
            preview.set_from_icon_name('start-here-symbolic');
            previewRow.subtitle = 'System default';
        }
    };

    sizeScale.connect('value-changed', () => settings.set_int('logo-icon-size', Math.round(sizeScale.get_value())));
    settings.connect('changed::logo-icon-size', () => {
        sizeScale.set_value(settings.get_int('logo-icon-size'));
        updatePreview();
    });

    const tiles = new Gtk.FlowBox({
        selection_mode: Gtk.SelectionMode.SINGLE,
        max_children_per_line: 8,
        min_children_per_line: 4,
        row_spacing: 8,
        column_spacing: 8,
        homogeneous: true,
        margin_top: 6,
        margin_bottom: 6,
    });

    // Re-selecting the current tile after a rebuild must not count as a user click
    let rebuilding = false;

    const rebuildTiles = () => {
        tiles.remove_all();

        const symbolic = settings.get_boolean('logo-distro-icon-symbolic');
        const current = settings.get_string('logo-custom-icon-path') ? null : settings.get_string('logo-distro-icon');

        tiles.append(new Gtk.Image({icon_name: 'action-unavailable-symbolic', pixel_size: 28, tooltip_text: 'None'}));
        for (const [stem, label] of DISTRO_ICONS) {
            const path = variantPath(stem, symbolic);
            const image = path ? Gtk.Image.new_from_file(path) : new Gtk.Image({icon_name: 'image-missing-symbolic'});
            image.pixel_size = 28;
            image.tooltip_text = label;
            tiles.append(image);
        }

        rebuilding = true;
        const index = current ? DISTRO_ICONS.findIndex(([stem]) => stem === current) + 1 : 0;
        const tile = tiles.get_child_at_index(index);
        if (tile)
            tiles.select_child(tile);
        else
            tiles.unselect_all();
        rebuilding = false;
    };

    const refresh = () => {
        rebuildTiles();
        updatePreview();
    };

    tiles.connect('selected-children-changed', () => {
        const [selected] = tiles.get_selected_children();
        if (rebuilding || !selected)
            return;

        const index = selected.get_index();
        settings.set_string('logo-custom-icon-path', '');
        settings.set_string('logo-distro-icon', index === 0 ? '' : DISTRO_ICONS[index - 1][0]);
    });

    symbolicRow.connect('notify::active', refresh);
    settings.connect('changed::logo-distro-icon', refresh);
    settings.connect('changed::logo-custom-icon-path', refresh);
    refresh();

    const tilesRow = new Adw.ActionRow();
    tilesRow.set_child(tiles);
    group.add(tilesRow);

    const customRow = new Adw.ActionRow({
        title: 'Custom Icon File',
        subtitle: settings.get_string('logo-custom-icon-path') || 'None',
    });
    group.add(customRow);

    const choose = new Gtk.Button({label: 'Choose File\u2026', valign: Gtk.Align.CENTER});
    choose.connect('clicked', () => {
        const images = new Gtk.FileFilter({name: 'Image files'});
        IMAGE_MIME_TYPES.forEach(type => images.add_mime_type(type));
        IMAGE_PATTERNS.forEach(pattern => images.add_pattern(pattern));

        const all = new Gtk.FileFilter({name: 'All files'});
        all.add_pattern('*');

        const filters = Gio.ListStore.new(Gtk.FileFilter);
        filters.append(images);
        filters.append(all);

        const dialog = new Gtk.FileDialog({title: 'Select Icon Image'});
        dialog.set_filters(filters);
        dialog.set_default_filter(images);
        dialog.open(window, null, (_dialog, result) => {
            try {
                const path = dialog.open_finish(result)?.get_path();
                if (path) {
                    settings.set_string('logo-custom-icon-path', path);
                    customRow.subtitle = path;
                }
            } catch (_e) {
                // dialog cancelled
            }
        });
    });
    customRow.add_suffix(choose);

    const clear = flatButton('edit-clear-symbolic');
    clear.connect('clicked', () => {
        settings.set_string('logo-custom-icon-path', '');
        customRow.subtitle = 'None';
    });
    customRow.add_suffix(clear);
}

function addSystemMenuCommands(page, settings) {
    const group = new Adw.PreferencesGroup({
        title: 'System Menu Custom Commands',
        description: 'Extra items added to the bottom of the System Menu, each running a shell command',
    });
    page.add(group);

    const addButton = flatButton('list-add-symbolic');
    group.set_header_suffix(addButton);

    const store = jsonList(settings, 'system-menu-custom-items');
    let rows = [];

    const edit = change => {
        const items = store.load();
        change(items);
        store.save(items);
    };

    const makeRow = (item, index) => {
        const row = new Adw.ActionRow();
        const label = new Gtk.Entry({text: item.label || '', placeholder_text: 'Label', valign: Gtk.Align.CENTER, width_chars: 12});
        const command = new Gtk.Entry({
            text: item.value || '',
            placeholder_text: 'command --flag',
            valign: Gtk.Align.CENTER,
            width_chars: 20,
            hexpand: true,
        });
        const remove = flatButton('user-trash-symbolic');

        const save = () => edit(items => { items[index] = {label: label.text, value: command.text}; });
        label.connect('notify::text', save);
        command.connect('notify::text', save);
        remove.connect('clicked', () => {
            edit(items => items.splice(index, 1));
            rebuild();
        });

        [label, command, remove].forEach(widget => row.add_suffix(widget));
        return row;
    };

    const rebuild = () => {
        rows.forEach(row => group.remove(row));
        rows = store.load().map(makeRow);
        rows.forEach(row => group.add(row));
    };

    addButton.connect('clicked', () => {
        edit(items => items.push({label: 'New Item', value: ''}));
        rebuild();
    });
    rebuild();
}

function generalPage(settings, window, iconsDir) {
    const page = new Adw.PreferencesPage({title: 'General', icon_name: 'preferences-system-symbolic'});

    const main = new Adw.PreferencesGroup({title: 'Global Menu'});
    page.add(main);
    addSwitch(main, settings, 'show-indicator', 'Show Global Menu', 'Master toggle for the whole menu bar');
    const hideOverview = addSwitch(main, settings, 'hide-overview-button', 'Hide Activities Button',
        'An "Activities" item is then added to the System Menu instead');
    const keepLeft = addSwitch(main, settings, 'keep-activities-left', 'Keep Activities on Far Left',
        'Place the native Activities button before the System Menu logo and app menus');

    const syncKeepLeft = () => keepLeft.set_sensitive(!hideOverview.active);
    hideOverview.connect('notify::active', syncKeepLeft);
    syncKeepLeft();

    main.add(entryRow('File Manager / Desktop Name', settings.get_string('desktop-app-name'),
        text => settings.set_string('desktop-app-name', text || 'Nautilus')));

    const logo = new Adw.PreferencesGroup({
        title: 'System Menu',
        description: 'A button on the far left of the bar, similar to the Apple menu on macOS',
    });
    page.add(logo);
    addSwitch(logo, settings, 'show-logo-menu', 'Show System Menu Button',
        'If disabled, app menus start immediately next to Activities');
    addIconPicker(logo, settings, window, iconsDir);

    const items = new Adw.PreferencesGroup({title: 'System Menu Items'});
    page.add(items);
    addSwitch(items, settings, 'show-app-grid', 'App Grid');
    addCommandRow(items, settings, 'Software Center', 'show-software-center', 'software-center-command', COMMAND_PRESETS.softwareCenter);
    addCommandRow(items, settings, 'System Monitor', 'show-system-monitor', 'system-monitor-command', COMMAND_PRESETS.systemMonitor);
    addCommandRow(items, settings, 'Terminal', 'show-terminal', 'terminal-command', COMMAND_PRESETS.terminal);
    addSwitch(items, settings, 'show-extensions-app', 'Extensions App');

    const currentApp = settings.get_string('extensions-app-id');
    const appRow = new Adw.ComboRow({
        title: 'Extensions App to Launch',
        model: Gtk.StringList.new(EXTENSION_APPS.map(([, name]) => name)),
        selected: Math.max(0, EXTENSION_APPS.findIndex(([id]) => id === currentApp)),
    });
    appRow.connect('notify::selected', () => settings.set_string('extensions-app-id', EXTENSION_APPS[appRow.selected][0]));
    items.add(appRow);

    addSwitch(items, settings, 'show-force-quit', 'Force Quit App');

    addSystemMenuCommands(page, settings);

    const power = new Adw.PreferencesGroup({title: 'Power'});
    page.add(power);
    addSwitch(power, settings, 'show-power-options', 'Sleep / Restart / Shut Down');
    addSwitch(power, settings, 'show-lock-screen', 'Lock Screen');
    addSwitch(power, settings, 'show-log-out', 'Log Out');

    const advanced = new Adw.PreferencesGroup({
        title: 'Advanced',
        description: 'Off by default; turn on temporarily if you need to diagnose an issue',
    });
    page.add(advanced);
    addSwitch(advanced, settings, 'debug-logging', 'Verbose Error Logging');

    return page;
}

function menusPage(settings) {
    const page = new Adw.PreferencesPage({title: 'Menus', icon_name: 'view-list-symbolic'});
    const group = new Adw.PreferencesGroup({
        title: 'Built-in Menus',
        description: 'Choose which generic menus appear in the bar.',
    });
    page.add(group);

    for (const [key, title] of BUILTIN_MENUS)
        addSwitch(group, settings, key, title);

    return page;
}

function customMenusPage(settings) {
    const page = new Adw.PreferencesPage({title: 'Custom Menus', icon_name: 'list-add-symbolic'});
    const group = new Adw.PreferencesGroup({
        title: 'Custom Menus',
        description: 'Add any number of custom top-level menus, each running shell commands ' +
            'or sending keyboard shortcuts (GTK accelerator syntax, e.g. <Control><Alt>t)',
    });
    page.add(group);

    const addButton = flatButton('list-add-symbolic');
    group.set_header_suffix(addButton);

    const store = jsonList(settings, 'custom-menus');
    let rows = [];

    const edit = change => {
        const sections = store.load();
        change(sections);
        store.save(sections);
    };

    const placeholderFor = kind => (kind === 'shortcut' ? '<Control><Alt>t' : 'command --flag');

    const itemRow = (item, sectionIndex, itemIndex) => {
        const row = new Adw.ActionRow();
        const label = new Gtk.Entry({text: item.label || '', placeholder_text: 'Label', valign: Gtk.Align.CENTER, width_chars: 10});
        const kind = new Gtk.DropDown({
            model: Gtk.StringList.new(['Shell Command', 'Keyboard Shortcut']),
            selected: item.kind === 'shortcut' ? 1 : 0,
            valign: Gtk.Align.CENTER,
        });
        const value = new Gtk.Entry({
            text: item.value || '',
            placeholder_text: placeholderFor(item.kind),
            valign: Gtk.Align.CENTER,
            width_chars: 16,
        });
        const remove = flatButton('user-trash-symbolic');

        const save = () => edit(sections => {
            sections[sectionIndex].items[itemIndex] = {
                label: label.text,
                kind: kind.selected === 1 ? 'shortcut' : 'command',
                value: value.text,
            };
        });

        label.connect('notify::text', save);
        value.connect('notify::text', save);
        kind.connect('notify::selected', () => {
            value.placeholder_text = placeholderFor(kind.selected === 1 ? 'shortcut' : 'command');
            save();
        });
        remove.connect('clicked', () => {
            edit(sections => sections[sectionIndex].items.splice(itemIndex, 1));
            rebuild();
        });

        [label, kind, value, remove].forEach(widget => row.add_suffix(widget));
        return row;
    };

    const sectionRow = (section, index) => {
        const items = section.items ?? [];
        const expander = new Adw.ExpanderRow({
            title: section.label || 'Untitled Menu',
            subtitle: `${items.length} item(s)`,
        });

        const enabled = new Gtk.Switch({active: section.enabled !== false, valign: Gtk.Align.CENTER});
        enabled.connect('notify::active', () => edit(sections => { sections[index].enabled = enabled.active; }));
        expander.add_suffix(enabled);

        const remove = flatButton('user-trash-symbolic');
        remove.connect('clicked', () => {
            edit(sections => sections.splice(index, 1));
            rebuild();
        });
        expander.add_suffix(remove);

        expander.add_row(entryRow('Menu Label', section.label || '', text => {
            edit(sections => { sections[index].label = text; });
            expander.title = text || 'Untitled Menu';
        }));

        items.forEach((item, itemIndex) => expander.add_row(itemRow(item, index, itemIndex)));

        const addItem = flatButton('list-add-symbolic');
        addItem.connect('clicked', () => {
            edit(sections => {
                sections[index].items ??= [];
                sections[index].items.push({label: 'New Item', kind: 'command', value: ''});
            });
            rebuild();
        });
        const addRow = new Adw.ActionRow({title: 'Add Item', activatable_widget: addItem});
        addRow.add_suffix(addItem);
        expander.add_row(addRow);

        return expander;
    };

    const rebuild = () => {
        rows.forEach(row => group.remove(row));
        rows = store.load().map(sectionRow);
        rows.forEach(row => group.add(row));
    };

    addButton.connect('clicked', () => {
        edit(sections => sections.push({label: `Custom ${sections.length + 1}`, enabled: true, items: []}));
        rebuild();
    });
    rebuild();

    return page;
}

function linkRow(group, title, uri) {
    const row = new Adw.ActionRow({title, subtitle: uri, activatable: true});
    row.connect('activated', () => openUri(uri));
    group.add(row);
    return row;
}

function aboutPage(metadata) {
    const page = new Adw.PreferencesPage({title: 'About', icon_name: 'help-about-symbolic'});

    const group = new Adw.PreferencesGroup();
    page.add(group);
    group.add(new Adw.ActionRow({title: metadata.name || 'Global Menu for GNOME'}));
    group.add(new Adw.ActionRow({title: 'Version', subtitle: String(metadata.version ?? '')}));

    const description = new Adw.ActionRow({title: 'Description', subtitle: metadata.description || ''});
    description.set_subtitle_lines(0);
    group.add(description);

    if (metadata.url) {
        linkRow(group, 'Homepage', metadata.url);
        linkRow(group, 'Report a Bug', `${metadata.url.replace(/\/$/, '')}/issues`);
    }

    const support = linkRow(group, 'Support the Development', KOFI_URL);
    support.add_prefix(new Gtk.Image({icon_name: 'emblem-favorite-symbolic'}));

    const notes = new Adw.PreferencesGroup({title: 'Notes'});
    page.add(notes);

    const icons = new Adw.ActionRow({
        title: 'Distro icons',
        subtitle: 'Bundled distro logos are trademarks of their respective owners, included ' +
            'only to represent each distribution/project in the icon picker.',
    });
    icons.set_subtitle_lines(0);
    notes.add(icons);

    return page;
}

export default class GlobalMenuPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.add(generalPage(settings, window, GLib.build_filenamev([this.path, 'icons'])));
        window.add(menusPage(settings));
        window.add(customMenusPage(settings));
        window.add(aboutPage(this.metadata));
        window.set_default_size(680, 780);
    }
}
