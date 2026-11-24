import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {debug} from './utils.js';

const ROW_ITEMS = {
    'hide-qs-screenshot': 'ScreenshotItem',
    'hide-qs-settings': 'SettingsItem',
    'hide-qs-lock': 'LockItem',
    'hide-qs-power-menu': 'ShutdownItem',
    'hide-qs-battery': 'PowerToggle',
};

export const QUICK_SETTINGS_KEYS = [
    ...Object.keys(ROW_ITEMS),
    'hide-qs-power-icon',
    'hide-qs-background-apps',
];

const isSpacer = actor => actor.constructor.name === 'Actor';

export class QuickSettingsTrimmer {
    constructor(settings) {
        this._settings = settings;
        this._hidden = new Map();
    }

    sync() {
        const wanted = new Set(this._targets());

        for (const actor of [...this._hidden.keys()]) {
            if (!wanted.has(actor))
                this._restore(actor);
        }
        wanted.forEach(actor => this._hide(actor));
    }

    destroy() {
        [...this._hidden.keys()].forEach(actor => this._restore(actor));
    }

    _targets() {
        const system = Main.panel.statusArea.quickSettings?._system;
        const row = system?._systemItem?.child?.get_children() ?? [];
        const on = key => this._settings.get_boolean(key);
        const targets = [];

        for (const [key, className] of Object.entries(ROW_ITEMS)) {
            if (!on(key))
                continue;
            const actor = row.find(child => child.constructor.name === className);
            if (actor)
                targets.push(actor);
            else
                debug(`quick settings: no ${className} in [${row.map(child => child.constructor.name)}]`);
        }

        if (on('hide-qs-power-icon') && system)
            targets.push(system);

        if (on('hide-qs-background-apps'))
            targets.push(...Main.panel.statusArea.quickSettings?._backgroundApps?.quickSettingsItems ?? []);

        if (this._rowIsEmpty(row, targets))
            targets.push(system._systemItem);

        return targets;
    }

    _rowIsEmpty(row, targets) {
        const buttons = row.filter(actor => !isSpacer(actor));
        return buttons.some(actor => targets.includes(actor)) &&
            buttons.every(actor => targets.includes(actor) || !actor.visible);
    }

    _hide(actor) {
        if (this._hidden.has(actor))
            return;

        const ids = [
            actor.connect('notify::visible', () => actor.visible && actor.hide()),
            actor.connect('destroy', () => this._hidden.delete(actor)),
        ];
        this._hidden.set(actor, {ids, wasVisible: actor.visible});
        actor.hide();
    }

    _restore(actor) {
        const {ids, wasVisible} = this._hidden.get(actor);
        this._hidden.delete(actor);
        ids.forEach(id => actor.disconnect(id));
        if (wasVisible)
            actor.show();
    }
}
