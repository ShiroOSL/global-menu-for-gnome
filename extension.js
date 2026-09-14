import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { MenuManager } from './menuManager.js';
import { SystemMenuButton } from './systemMenu.js';

export default class GlobalMenuExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._menuManager = null;
        this._settings = null;
        this._settingsChangedId = null;
        this._logoButton = null;
        this._overviewHidden = false;
    }

    enable() {
        console.log(`[globalmenu@ShiroOSL.github.io] Enabling extension.`);

        this._settings = this.getSettings();

        const uuid = this.metadata.uuid || 'globalmenu@ShiroOSL.github.io';

        this._menuManager = new MenuManager(uuid, this._settings);

        const ICON_ONLY_KEYS = ['logo-icon-name', 'logo-custom-icon-path', 'logo-distro-icon', 'logo-distro-icon-symbolic', 'logo-icon-size'];

        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === 'hide-overview-button' || key === 'keep-activities-left') {
                this._syncOverviewButton();
                this._syncLogoPosition();
                this._syncMenuVisibility();
            } else if (key === 'show-logo-menu') {
                this._syncLogoButton();
                this._syncMenuVisibility();
            } else if (!ICON_ONLY_KEYS.includes(key)) {
                // Any other key (menu toggles, custom menus, indicator,
                // logo-menu item toggles) affects what the bar should show
                // right now. Icon-only keys are handled internally by
                // SystemMenuButton itself.
                this._syncMenuVisibility();
            }
        });

        global.display.connectObject('notify::focus-window', () => {
            this._syncMenuVisibility();
        }, this);

        this._syncOverviewButton();
        this._syncLogoButton();
        this._syncMenuVisibility();
    }

    _getLogoPosition() {
        let hideOverview = this._settings.get_boolean('hide-overview-button');
        let keepLeft = this._settings.get_boolean('keep-activities-left');
        return (!hideOverview && keepLeft) ? 1 : 0;
    }

    _syncLogoPosition() {
        if (!this._logoButton || !this._logoButton.container) return;
        let targetPos = this._getLogoPosition();
        if (this._logoButton.container.get_parent() === Main.panel._leftBox) {
            Main.panel._leftBox.set_child_at_index(this._logoButton.container, targetPos);
        }
    }

    _syncLogoButton() {
        let shouldShow = this._settings.get_boolean('show-logo-menu');

        if (shouldShow && !this._logoButton) {
            this._logoButton = new SystemMenuButton(this._settings, this.path);
            let pos = this._getLogoPosition();
            Main.panel.addToStatusArea('globalmenu-logo', this._logoButton, pos, 'left');
        } else if (!shouldShow && this._logoButton) {
            this._logoButton.destroy();
            this._logoButton = null;
        } else if (shouldShow && this._logoButton) {
            this._syncLogoPosition();
        }
    }

    _syncOverviewButton() {
        let activities = Main.panel.statusArea['activities'];
        if (!activities) return;

        let shouldHide = this._settings.get_boolean('hide-overview-button');
        if (shouldHide && !this._overviewHidden) {
            activities.hide();
            this._overviewHidden = true;
        } else if (!shouldHide && this._overviewHidden) {
            activities.show();
            this._overviewHidden = false;
        }

        if (!shouldHide && activities.container && activities.container.get_parent() === Main.panel._leftBox) {
            let keepLeft = this._settings.get_boolean('keep-activities-left');
            let targetPos = keepLeft ? 0 : (this._settings.get_boolean('show-logo-menu') ? 1 : 0);
            Main.panel._leftBox.set_child_at_index(activities.container, targetPos);
        }
    }

    _syncMenuVisibility() {
        if (!this._menuManager) return;

        if (this._settings.get_boolean('show-indicator')) {
            let activeWindow = global.display.get_focus_window();
            this._menuManager.updateMenuForWindow(activeWindow);
        } else {
            this._menuManager.clear();
        }
    }

    disable() {
        console.log(`[globalmenu@ShiroOSL.github.io] Disabling extension.`);

        global.display.disconnectObject(this);

        if (this._settings && this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._menuManager) {
            this._menuManager.destroy();
            this._menuManager = null;
        }

        if (this._logoButton) {
            this._logoButton.destroy();
            this._logoButton = null;
        }

        let activities = Main.panel.statusArea['activities'];
        if (activities) {
            if (this._overviewHidden) {
                activities.show();
                this._overviewHidden = false;
            }
            if (activities.container && activities.container.get_parent() === Main.panel._leftBox) {
                Main.panel._leftBox.set_child_at_index(activities.container, 0);
            }
        }

        this._settings = null;
    }
}
