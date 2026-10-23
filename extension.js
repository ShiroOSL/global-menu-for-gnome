import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {MenuManager} from './menuManager.js';
import {SystemMenuButton} from './systemMenu.js';
import {setDebug} from './utils.js';

// systemInfoPanel.js is a GTK4 script that systemMenu.js starts as its own
// `gjs -m` process. Never import it here.

const ACTIVITIES_KEYS = ['hide-overview-button', 'keep-activities-left'];
const LOGO_KEYS = [
    'logo-icon-name', 'logo-custom-icon-path', 'logo-distro-icon',
    'logo-distro-icon-symbolic', 'logo-icon-size',
];

export default class GlobalMenuExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._menuManager = new MenuManager(this.metadata.uuid, this._settings);
        this._logoButton = null;
        this._overviewHidden = false;

        setDebug(this._settings.get_boolean('debug-logging'));

        this._settings.connectObject('changed', (_settings, key) => this._onSettingChanged(key), this);
        global.display.connectObject('notify::focus-window', () => this._syncMenus(), this);

        this._syncOverviewButton();
        this._syncLogoButton();
        this._syncMenus();
    }

    disable() {
        global.display.disconnectObject(this);
        this._settings.disconnectObject(this);

        this._menuManager.destroy();
        this._menuManager = null;

        this._logoButton?.destroy();
        this._logoButton = null;

        const activities = Main.panel.statusArea['activities'];
        if (activities) {
            if (this._overviewHidden)
                activities.show();
            if (activities.container?.get_parent() === Main.panel._leftBox)
                Main.panel._leftBox.set_child_at_index(activities.container, 0);
        }

        this._overviewHidden = false;
        this._settings = null;
    }

    _onSettingChanged(key) {
        if (key === 'debug-logging') {
            setDebug(this._settings.get_boolean(key));
        } else if (ACTIVITIES_KEYS.includes(key)) {
            this._syncOverviewButton();
            this._syncLogoPosition();
            this._syncMenus();
        } else if (key === 'show-logo-menu') {
            this._syncLogoButton();
            this._syncMenus();
        } else if (!LOGO_KEYS.includes(key)) {
            this._syncMenus();
        }
    }

    _logoIndex() {
        const activitiesVisible = !this._settings.get_boolean('hide-overview-button');
        return activitiesVisible && this._settings.get_boolean('keep-activities-left') ? 1 : 0;
    }

    _syncLogoPosition() {
        const container = this._logoButton?.container;
        if (container?.get_parent() === Main.panel._leftBox)
            Main.panel._leftBox.set_child_at_index(container, this._logoIndex());
    }

    _syncLogoButton() {
        const wanted = this._settings.get_boolean('show-logo-menu');

        if (wanted && !this._logoButton) {
            this._logoButton = new SystemMenuButton(this._settings, this.path);
            Main.panel.addToStatusArea('globalmenu-logo', this._logoButton, this._logoIndex(), 'left');
        } else if (!wanted && this._logoButton) {
            this._logoButton.destroy();
            this._logoButton = null;
        } else if (wanted) {
            this._syncLogoPosition();
        }
    }

    _syncOverviewButton() {
        const activities = Main.panel.statusArea['activities'];
        if (!activities)
            return;

        const hide = this._settings.get_boolean('hide-overview-button');
        if (hide && !this._overviewHidden) {
            activities.hide();
            this._overviewHidden = true;
        } else if (!hide && this._overviewHidden) {
            activities.show();
            this._overviewHidden = false;
        }

        if (!hide && activities.container?.get_parent() === Main.panel._leftBox) {
            const keepLeft = this._settings.get_boolean('keep-activities-left');
            const logoBefore = this._settings.get_boolean('show-logo-menu');
            Main.panel._leftBox.set_child_at_index(activities.container, keepLeft || !logoBefore ? 0 : 1);
        }
    }

    _syncMenus() {
        if (!this._settings.get_boolean('show-indicator'))
            this._menuManager.clear();
        else
            this._menuManager.updateMenuForWindow(global.display.get_focus_window());
    }
}
