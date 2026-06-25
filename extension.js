import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { MenuManager } from './menuManager.js';

export default class GlobalMenuExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._menuManager = null;
    }

    enable() {
        console.log(`[globalmenu@shiro.com] Enabling extension.`);
        // The MenuManager now manages its own multiple buttons on the panel.
        // We don't call Main.panel.addToStatusArea here because MenuManager
        // will add individual TopLevelMenuButton instances which ARE PanelMenu.Buttons.
        this._menuManager = new MenuManager(this.uuid);
    }

    disable() {
        console.log(`[globalmenu@shiro.com] Disabling extension.`);
        if (this._menuManager) {
            this._menuManager.destroy();
            this._menuManager = null;
        }
    }
}
