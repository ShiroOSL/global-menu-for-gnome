import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const DISTRO_ICONS = [
    ['apple', 'Apple'],
    ['fedora', 'Fedora'],
    ['debian', 'Debian'],
    ['ubuntu', 'Ubuntu'],
    ['arch', 'Arch'],
    ['manjaro', 'Manjaro'],
    ['popos', 'Pop!_OS'],
    ['opensuse', 'openSUSE'],
    ['redhat', 'Red Hat'],
    ['gentoo', 'Gentoo'],
    ['freebsd', 'FreeBSD'],
    ['zorin', 'Zorin OS'],
    ['gnome', 'GNOME'],
];

export default class GlobalMenuPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.add(this._buildGeneralPage(settings, window));
        window.add(this._buildMenusPage(settings));
        window.add(this._buildCustomMenuPage(settings));
        window.add(this._buildAboutPage());

        window.set_default_size(680, 780);
    }

    _buildGeneralPage(settings, window) {
        const page = new Adw.PreferencesPage({ title: 'General', icon_name: 'preferences-system-symbolic' });

        const mainGroup = new Adw.PreferencesGroup({ title: 'Global Menu' });
        page.add(mainGroup);

        const showRow = new Adw.SwitchRow({ title: 'Show Global Menu', subtitle: 'Master toggle for the whole menu bar' });
        mainGroup.add(showRow);
        settings.bind('show-indicator', showRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const hideOverviewRow = new Adw.SwitchRow({ title: 'Hide Activities Button', subtitle: 'An "Activities" item is then added to the System Menu instead' });
        mainGroup.add(hideOverviewRow);
        settings.bind('hide-overview-button', hideOverviewRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const desktopNameRow = new Adw.EntryRow({ title: 'File Manager / Desktop Name' });
        desktopNameRow.set_text(settings.get_string('desktop-app-name'));
        desktopNameRow.connect('notify::text', () => settings.set_string('desktop-app-name', desktopNameRow.get_text() || 'Nautilus'));
        mainGroup.add(desktopNameRow);

        const logoGroup = new Adw.PreferencesGroup({
            title: 'System Menu',
            description: 'A button on the far left of the bar, similar to the Apple menu on macOS',
        });
        page.add(logoGroup);

        const showLogoRow = new Adw.SwitchRow({ title: 'Show System Menu Button' });
        logoGroup.add(showLogoRow);
        settings.bind('show-logo-menu', showLogoRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        this._buildIconPicker(logoGroup, settings, window);

        const itemsGroup = new Adw.PreferencesGroup({ title: 'System Menu Items' });
        page.add(itemsGroup);

        const appGridRow = new Adw.SwitchRow({ title: 'App Grid' });
        itemsGroup.add(appGridRow);
        settings.bind('show-app-grid', appGridRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        this._addCommandRow(itemsGroup, settings, 'Software Center', 'show-software-center', 'software-center-command',
            ['gnome-software', 'plasma-discover', 'pamac-manager', 'snap-store']);
        this._addCommandRow(itemsGroup, settings, 'System Monitor', 'show-system-monitor', 'system-monitor-command',
            ['gnome-system-monitor', 'resources', 'ksysguard', 'xfce4-taskmanager']);
        this._addCommandRow(itemsGroup, settings, 'Terminal', 'show-terminal', 'terminal-command',
            ['ptyxis', 'gnome-terminal', 'kgx', 'konsole', 'kitty', 'alacritty', 'tilix', 'terminator', 'xterm']);

        const extRow = new Adw.SwitchRow({ title: 'Extensions App' });
        itemsGroup.add(extRow);
        settings.bind('show-extensions-app', extRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const EXTENSIONS_APPS = [
            ['org.gnome.Extensions.desktop', 'GNOME Extensions'],
            ['com.mattjakeman.ExtensionManager.desktop', 'Extension Manager'],
        ];
        const extAppModel = Gtk.StringList.new(EXTENSIONS_APPS.map(([, label]) => label));
        const currentAppId = settings.get_string('extensions-app-id');
        const currentAppIndex = Math.max(0, EXTENSIONS_APPS.findIndex(([id]) => id === currentAppId));
        const extAppRow = new Adw.ComboRow({ title: 'Extensions App to Launch', model: extAppModel, selected: currentAppIndex });
        itemsGroup.add(extAppRow);
        extAppRow.connect('notify::selected', () => {
            settings.set_string('extensions-app-id', EXTENSIONS_APPS[extAppRow.selected][0]);
        });

        const forceQuitRow = new Adw.SwitchRow({ title: 'Force Quit App' });
        itemsGroup.add(forceQuitRow);
        settings.bind('show-force-quit', forceQuitRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        this._buildSystemMenuCustomItems(page, settings);

        const powerGroup = new Adw.PreferencesGroup({ title: 'Power' });
        page.add(powerGroup);

        const powerRow = new Adw.SwitchRow({ title: 'Sleep / Restart / Shut Down' });
        powerGroup.add(powerRow);
        settings.bind('show-power-options', powerRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const lockRow = new Adw.SwitchRow({ title: 'Lock Screen' });
        powerGroup.add(lockRow);
        settings.bind('show-lock-screen', lockRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const logoutRow = new Adw.SwitchRow({ title: 'Log Out' });
        powerGroup.add(logoutRow);
        settings.bind('show-log-out', logoutRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const advancedGroup = new Adw.PreferencesGroup({
            title: 'Advanced',
            description: 'Off by default; turn on temporarily if you need to diagnose an issue',
        });
        page.add(advancedGroup);

        const debugRow = new Adw.SwitchRow({ title: 'Verbose Error Logging' });
        advancedGroup.add(debugRow);
        settings.bind('debug-logging', debugRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        return page;
    }

    // A visual icon picker: a grid of the bundled distro icons plus a
    // "custom file" option, instead of typing an icon name or path by hand.
    // Clicking a tile immediately applies it (and clears the other icon
    // sources), so selection always visibly takes effect.
    _buildIconPicker(group, settings, window) {
        const iconsDir = GLib.build_filenamev([this.path, 'icons']);

        const previewRow = new Adw.ActionRow({ title: 'Current Icon' });
        const previewImage = new Gtk.Image({ pixel_size: 32, margin_top: 6, margin_bottom: 6 });
        previewRow.add_prefix(previewImage);
        group.add(previewRow);

        const symbolicRow = new Adw.SwitchRow({ title: 'Symbolic (single-color) Style' });
        group.add(symbolicRow);
        settings.bind('logo-distro-icon-symbolic', symbolicRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const sizeAdjustment = new Gtk.Adjustment({ lower: 12, upper: 48, step_increment: 1, page_increment: 4 });
        const sizeScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: sizeAdjustment,
            digits: 0,
            draw_value: true,
            hexpand: true,
            valign: Gtk.Align.CENTER,
        });
        sizeScale.set_size_request(220, -1);
        for (let mark of [12, 16, 22, 32, 48])
            sizeScale.add_mark(mark, Gtk.PositionType.BOTTOM, null);
        sizeScale.set_value(settings.get_int('logo-icon-size'));

        const sizeRow = new Adw.ActionRow({ title: 'Icon Size' });
        sizeRow.add_suffix(sizeScale);
        group.add(sizeRow);

        sizeScale.connect('value-changed', () => settings.set_int('logo-icon-size', Math.round(sizeScale.get_value())));
        settings.connect('changed::logo-icon-size', () => {
            sizeScale.set_value(settings.get_int('logo-icon-size'));
            updatePreview();
        });

        const flowBox = new Gtk.FlowBox({
            selection_mode: Gtk.SelectionMode.SINGLE,
            max_children_per_line: 8,
            min_children_per_line: 4,
            row_spacing: 8,
            column_spacing: 8,
            homogeneous: true,
            margin_top: 6,
            margin_bottom: 6,
        });

        const resolveVariantPath = (stem, symbolic) => {
            let variant = symbolic ? 'symbolic' : 'color';
            let path = GLib.build_filenamev([iconsDir, `distro-${stem}-${variant}.svg`]);
            if (GLib.file_test(path, GLib.FileTest.EXISTS)) return path;
            let otherVariant = symbolic ? 'color' : 'symbolic';
            let fallbackPath = GLib.build_filenamev([iconsDir, `distro-${stem}-${otherVariant}.svg`]);
            return GLib.file_test(fallbackPath, GLib.FileTest.EXISTS) ? fallbackPath : null;
        };

        const updatePreview = () => {
            previewImage.pixel_size = settings.get_int('logo-icon-size') || 32;
            let customPath = settings.get_string('logo-custom-icon-path');
            if (customPath && GLib.file_test(customPath, GLib.FileTest.EXISTS)) {
                previewImage.set_from_file(customPath);
                previewRow.set_subtitle('Custom file');
                return;
            }
            let distroStem = settings.get_string('logo-distro-icon');
            if (distroStem) {
                let path = resolveVariantPath(distroStem, settings.get_boolean('logo-distro-icon-symbolic'));
                if (path) {
                    previewImage.set_from_file(path);
                    previewRow.set_subtitle(DISTRO_ICONS.find(([s]) => s === distroStem)?.[1] || distroStem);
                    return;
                }
            }
            previewImage.set_from_icon_name('start-here-symbolic');
            previewRow.set_subtitle('System default');
        };

        let suppressSelectionEvent = false;

        const rebuildTiles = () => {
            let child;
            while ((child = flowBox.get_first_child()) !== null)
                flowBox.remove(child);

            let symbolic = settings.get_boolean('logo-distro-icon-symbolic');
            let currentStem = settings.get_string('logo-custom-icon-path') ? null : settings.get_string('logo-distro-icon');

            // "None" tile first, restores the plain system icon.
            let noneImage = new Gtk.Image({ icon_name: 'action-unavailable-symbolic', pixel_size: 28 });
            noneImage.set_tooltip_text('None');
            flowBox.append(noneImage);

            DISTRO_ICONS.forEach(([stem, label]) => {
                let path = resolveVariantPath(stem, symbolic);
                let image = path
                    ? Gtk.Image.new_from_file(path)
                    : new Gtk.Image({ icon_name: 'image-missing-symbolic' });
                image.pixel_size = 28;
                image.set_tooltip_text(label);
                flowBox.append(image);
            });

            // Restore selection to match current settings. This is a
            // programmatic selection reflecting existing state, not a user
            // click - it must not re-fire the mutation handler below, or
            // picking a custom file gets immediately undone (the "None"
            // tile gets auto-selected to show "no distro icon active",
            // which would otherwise clear the custom path we just set).
            suppressSelectionEvent = true;
            let selectIndex = currentStem ? DISTRO_ICONS.findIndex(([s]) => s === currentStem) + 1 : 0;
            let target = flowBox.get_child_at_index(selectIndex);
            if (target) flowBox.select_child(target);
            else flowBox.unselect_all();
            suppressSelectionEvent = false;
        };

        flowBox.connect('selected-children-changed', () => {
            if (suppressSelectionEvent) return;

            let selected = flowBox.get_selected_children();
            if (selected.length === 0) return;
            let index = selected[0].get_index();

            // Selecting any tile here always clears the custom file
            // override, so the choice actually takes visible effect.
            settings.set_string('logo-custom-icon-path', '');

            if (index === 0) {
                settings.set_string('logo-distro-icon', '');
            } else {
                settings.set_string('logo-distro-icon', DISTRO_ICONS[index - 1][0]);
            }
        });

        rebuildTiles();
        updatePreview();

        symbolicRow.connect('notify::active', () => {
            rebuildTiles();
            updatePreview();
        });

        settings.connect('changed::logo-distro-icon', () => { rebuildTiles(); updatePreview(); });
        settings.connect('changed::logo-custom-icon-path', () => { rebuildTiles(); updatePreview(); });

        let flowRow = new Adw.ActionRow();
        flowRow.set_child(flowBox);
        group.add(flowRow);

        const customRow = new Adw.ActionRow({
            title: 'Custom Icon File',
            subtitle: settings.get_string('logo-custom-icon-path') || 'None',
        });
        group.add(customRow);

        const chooseButton = new Gtk.Button({ label: 'Choose File\u2026', valign: Gtk.Align.CENTER });
        chooseButton.connect('clicked', () => {
            let dialog = new Gtk.FileDialog({ title: 'Select Icon Image' });

            // gdk-pixbuf (what St.Icon/Gtk.Image render through) natively
            // supports all of these; SVG is handled separately via
            // librsvg. "All files" is still offered as a fallback filter.
            let imageFilter = new Gtk.FileFilter({ name: 'Image files' });
            imageFilter.add_mime_type('image/svg+xml');
            imageFilter.add_mime_type('image/png');
            imageFilter.add_mime_type('image/jpeg');
            imageFilter.add_mime_type('image/webp');
            imageFilter.add_mime_type('image/bmp');
            imageFilter.add_mime_type('image/gif');
            imageFilter.add_pattern('*.svg');
            imageFilter.add_pattern('*.png');
            imageFilter.add_pattern('*.jpg');
            imageFilter.add_pattern('*.jpeg');
            imageFilter.add_pattern('*.webp');
            imageFilter.add_pattern('*.bmp');
            imageFilter.add_pattern('*.gif');

            let allFilter = new Gtk.FileFilter({ name: 'All files' });
            allFilter.add_pattern('*');

            let filterList = Gio.ListStore.new(Gtk.FileFilter);
            filterList.append(imageFilter);
            filterList.append(allFilter);
            dialog.set_filters(filterList);
            dialog.set_default_filter(imageFilter);

            dialog.open(window, null, (dlg, res) => {
                try {
                    let file = dlg.open_finish(res);
                    if (file) {
                        let path = file.get_path();
                        settings.set_string('logo-custom-icon-path', path);
                        customRow.set_subtitle(path);
                    }
                } catch (e) {
                    // User cancelled, or the dialog failed; nothing to do.
                }
            });
        });
        customRow.add_suffix(chooseButton);

        const clearButton = new Gtk.Button({ icon_name: 'edit-clear-symbolic', valign: Gtk.Align.CENTER, css_classes: ['flat'] });
        clearButton.connect('clicked', () => {
            settings.set_string('logo-custom-icon-path', '');
            customRow.set_subtitle('None');
        });
        customRow.add_suffix(clearButton);
    }

    _addCommandRow(group, settings, title, enabledKey, commandKey, presets = []) {
        const row = new Adw.SwitchRow({ title });
        group.add(row);
        settings.bind(enabledKey, row, 'active', Gio.SettingsBindFlags.DEFAULT);

        const commandRow = new Adw.EntryRow({ title: `${title} Command` });
        commandRow.set_text(settings.get_string(commandKey));
        commandRow.connect('notify::text', () => settings.set_string(commandKey, commandRow.get_text()));
        group.add(commandRow);

        if (presets.length > 0) {
            const presetModel = Gtk.StringList.new(['Presets\u2026', ...presets]);
            const presetDropdown = new Gtk.DropDown({ model: presetModel, valign: Gtk.Align.CENTER, selected: 0 });
            presetDropdown.connect('notify::selected', () => {
                if (presetDropdown.selected === 0) return;
                commandRow.set_text(presets[presetDropdown.selected - 1]);
                presetDropdown.selected = 0;
            });
            commandRow.add_suffix(presetDropdown);
        }
    }

    // Flat list of {label, value} shell-command items appended as their
    // own section at the bottom of the System Menu (distinct from the
    // top-bar Custom Menus feature, which supports multiple named menus).
    _buildSystemMenuCustomItems(page, settings) {
        const group = new Adw.PreferencesGroup({
            title: 'System Menu Custom Commands',
            description: 'Extra items added to the bottom of the System Menu, each running a shell command',
        });
        page.add(group);

        const addButton = new Gtk.Button({ icon_name: 'list-add-symbolic', valign: Gtk.Align.CENTER, css_classes: ['flat'] });
        group.set_header_suffix(addButton);

        const loadItems = () => {
            try {
                let items = JSON.parse(settings.get_string('system-menu-custom-items') || '[]');
                return Array.isArray(items) ? items : [];
            } catch (e) {
                return [];
            }
        };
        const saveItems = (items) => settings.set_string('system-menu-custom-items', JSON.stringify(items));

        let rows = [];

        const rebuildRows = () => {
            for (let row of rows)
                group.remove(row);
            rows = [];

            let items = loadItems();
            items.forEach((item, index) => {
                let row = new Adw.ActionRow();

                let labelEntry = new Gtk.Entry({
                    text: item.label || '',
                    placeholder_text: 'Label',
                    valign: Gtk.Align.CENTER,
                    width_chars: 12,
                });
                let valueEntry = new Gtk.Entry({
                    text: item.value || '',
                    placeholder_text: 'command --flag',
                    valign: Gtk.Align.CENTER,
                    width_chars: 20,
                    hexpand: true,
                });
                let removeButton = new Gtk.Button({ icon_name: 'user-trash-symbolic', valign: Gtk.Align.CENTER, css_classes: ['flat'] });

                const persist = () => {
                    let current = loadItems();
                    current[index] = { label: labelEntry.get_text(), value: valueEntry.get_text() };
                    saveItems(current);
                };

                labelEntry.connect('notify::text', persist);
                valueEntry.connect('notify::text', persist);
                removeButton.connect('clicked', () => {
                    let current = loadItems();
                    current.splice(index, 1);
                    saveItems(current);
                    rebuildRows();
                });

                row.add_suffix(labelEntry);
                row.add_suffix(valueEntry);
                row.add_suffix(removeButton);
                group.add(row);
                rows.push(row);
            });
        };

        addButton.connect('clicked', () => {
            let current = loadItems();
            current.push({ label: 'New Item', value: '' });
            saveItems(current);
            rebuildRows();
        });

        rebuildRows();
    }

    _buildMenusPage(settings) {
        const page = new Adw.PreferencesPage({ title: 'Menus', icon_name: 'view-list-symbolic' });
        const group = new Adw.PreferencesGroup({
            title: 'Built-in Menus',
            description: 'Choose which generic menus appear in the bar.',
        });
        page.add(group);

        const menus = [
            ['menu-app-enabled', 'App Menu'],
            ['menu-file-enabled', 'File Menu'],
            ['menu-edit-enabled', 'Edit Menu'],
            ['menu-view-enabled', 'View Menu'],
            ['menu-go-enabled', 'Go Menu'],
            ['menu-window-enabled', 'Window Menu'],
            ['menu-help-enabled', 'Help Menu'],
        ];

        for (let [key, title] of menus) {
            let row = new Adw.SwitchRow({ title });
            group.add(row);
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        }

        return page;
    }

    // Multiple independent custom menu sections: each becomes its own
    // top-level menu button, with its own label, enable switch, and list
    // of command/shortcut items.
    _buildCustomMenuPage(settings) {
        const page = new Adw.PreferencesPage({ title: 'Custom Menus', icon_name: 'list-add-symbolic' });

        const group = new Adw.PreferencesGroup({
            title: 'Custom Menus',
            description: 'Add any number of custom top-level menus, each running shell commands ' +
                'or sending keyboard shortcuts (GTK accelerator syntax, e.g. <Control><Alt>t)',
        });
        page.add(group);

        const addSectionButton = new Gtk.Button({ icon_name: 'list-add-symbolic', valign: Gtk.Align.CENTER, css_classes: ['flat'] });
        group.set_header_suffix(addSectionButton);

        const loadSections = () => {
            try {
                return JSON.parse(settings.get_string('custom-menus') || '[]');
            } catch (e) {
                return [];
            }
        };
        const saveSections = (sections) => settings.set_string('custom-menus', JSON.stringify(sections));

        let sectionRows = [];

        const rebuildSections = () => {
            for (let row of sectionRows)
                group.remove(row);
            sectionRows = [];

            let sections = loadSections();
            sections.forEach((section, sectionIndex) => {
                let expander = new Adw.ExpanderRow({
                    title: section.label || 'Untitled Menu',
                    subtitle: `${(section.items || []).length} item(s)`,
                });

                let enableSwitch = new Gtk.Switch({ active: section.enabled !== false, valign: Gtk.Align.CENTER });
                enableSwitch.connect('notify::active', () => {
                    let current = loadSections();
                    current[sectionIndex].enabled = enableSwitch.get_active();
                    saveSections(current);
                });
                expander.add_suffix(enableSwitch);

                let removeSectionButton = new Gtk.Button({ icon_name: 'user-trash-symbolic', valign: Gtk.Align.CENTER, css_classes: ['flat'] });
                removeSectionButton.connect('clicked', () => {
                    let current = loadSections();
                    current.splice(sectionIndex, 1);
                    saveSections(current);
                    rebuildSections();
                });
                expander.add_suffix(removeSectionButton);

                let labelRow = new Adw.EntryRow({ title: 'Menu Label' });
                labelRow.set_text(section.label || '');
                labelRow.connect('notify::text', () => {
                    let current = loadSections();
                    current[sectionIndex].label = labelRow.get_text();
                    saveSections(current);
                    expander.set_title(labelRow.get_text() || 'Untitled Menu');
                });
                expander.add_row(labelRow);

                let items = section.items || [];
                items.forEach((item, itemIndex) => {
                    let itemRow = new Adw.ActionRow();

                    let labelEntry = new Gtk.Entry({ text: item.label || '', placeholder_text: 'Label', valign: Gtk.Align.CENTER, width_chars: 10 });
                    let kindDropdown = new Gtk.DropDown({
                        model: Gtk.StringList.new(['Shell Command', 'Keyboard Shortcut']),
                        selected: item.kind === 'shortcut' ? 1 : 0,
                        valign: Gtk.Align.CENTER,
                    });
                    let valueEntry = new Gtk.Entry({
                        text: item.value || '',
                        placeholder_text: item.kind === 'shortcut' ? '<Control><Alt>t' : 'command --flag',
                        valign: Gtk.Align.CENTER,
                        width_chars: 16,
                    });
                    let removeItemButton = new Gtk.Button({ icon_name: 'user-trash-symbolic', valign: Gtk.Align.CENTER, css_classes: ['flat'] });

                    const persistItem = () => {
                        let current = loadSections();
                        current[sectionIndex].items[itemIndex] = {
                            label: labelEntry.get_text(),
                            kind: kindDropdown.selected === 1 ? 'shortcut' : 'command',
                            value: valueEntry.get_text(),
                        };
                        saveSections(current);
                    };

                    labelEntry.connect('notify::text', persistItem);
                    kindDropdown.connect('notify::selected', () => {
                        valueEntry.set_placeholder_text(kindDropdown.selected === 1 ? '<Control><Alt>t' : 'command --flag');
                        persistItem();
                    });
                    valueEntry.connect('notify::text', persistItem);
                    removeItemButton.connect('clicked', () => {
                        let current = loadSections();
                        current[sectionIndex].items.splice(itemIndex, 1);
                        saveSections(current);
                        rebuildSections();
                    });

                    itemRow.add_suffix(labelEntry);
                    itemRow.add_suffix(kindDropdown);
                    itemRow.add_suffix(valueEntry);
                    itemRow.add_suffix(removeItemButton);
                    expander.add_row(itemRow);
                });

                let addItemRow = new Adw.ActionRow({ title: 'Add Item' });
                let addItemButton = new Gtk.Button({ icon_name: 'list-add-symbolic', valign: Gtk.Align.CENTER, css_classes: ['flat'] });
                addItemButton.connect('clicked', () => {
                    let current = loadSections();
                    if (!current[sectionIndex].items) current[sectionIndex].items = [];
                    current[sectionIndex].items.push({ label: 'New Item', kind: 'command', value: '' });
                    saveSections(current);
                    rebuildSections();
                });
                addItemRow.add_suffix(addItemButton);
                addItemRow.set_activatable_widget(addItemButton);
                expander.add_row(addItemRow);

                group.add(expander);
                sectionRows.push(expander);
            });
        };

        addSectionButton.connect('clicked', () => {
            let current = loadSections();
            current.push({ label: `Custom ${current.length + 1}`, enabled: true, items: [] });
            saveSections(current);
            rebuildSections();
        });

        rebuildSections();

        return page;
    }

    _buildAboutPage() {
        const page = new Adw.PreferencesPage({ title: 'About', icon_name: 'help-about-symbolic' });
        const meta = this.metadata;

        const group = new Adw.PreferencesGroup();
        page.add(group);

        group.add(new Adw.ActionRow({ title: meta.name || 'Global Menu for GNOME' }));
        group.add(new Adw.ActionRow({ title: 'Version', subtitle: String(meta.version ?? '') }));

        const descRow = new Adw.ActionRow({ title: 'Description', subtitle: meta.description || '' });
        descRow.set_subtitle_lines(0);
        group.add(descRow);

        if (meta.url) {
            const urlRow = new Adw.ActionRow({ title: 'Homepage', subtitle: meta.url, activatable: true });
            urlRow.connect('activated', () => {
                Gio.AppInfo.launch_default_for_uri(meta.url, null);
            });
            group.add(urlRow);

            const issuesUrl = meta.url.replace(/\/$/, '') + '/issues';
            const bugRow = new Adw.ActionRow({ title: 'Report a Bug', subtitle: issuesUrl, activatable: true });
            bugRow.connect('activated', () => {
                Gio.AppInfo.launch_default_for_uri(issuesUrl, null);
            });
            group.add(bugRow);
        }

        const noteGroup = new Adw.PreferencesGroup({ title: 'Notes' });
        page.add(noteGroup);

        const iconsNote = new Adw.ActionRow({
            title: 'Distro icons',
            subtitle: 'Bundled distro logos are trademarks of their respective owners, included ' +
                'only to represent each distribution/project in the icon picker.',
        });
        iconsNote.set_subtitle_lines(0);
        noteGroup.add(iconsNote);

        return page;
    }
}
