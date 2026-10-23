import GLib from 'gi://GLib';

export const COMMAND_PRESETS = {
    terminal: ['ptyxis', 'gnome-terminal', 'kgx', 'konsole', 'kitty', 'alacritty', 'tilix', 'terminator', 'xterm'],
    softwareCenter: ['gnome-software', 'plasma-discover', 'pamac-manager', 'snap-store'],
    systemMonitor: ['gnome-system-monitor', 'resources', 'ksysguard', 'xfce4-taskmanager'],
};

let verbose = false;

export function setDebug(enabled) {
    verbose = enabled;
}

export function debug(message) {
    if (verbose)
        console.error(`[globalmenu] ${message}`);
}

export function spawn(argv) {
    try {
        GLib.spawn_async(null, argv, null, GLib.SpawnFlags.SEARCH_PATH, null);
    } catch (e) {
        debug(`could not run '${argv.join(' ')}': ${e}`);
    }
}

export function spawnLine(commandLine) {
    try {
        const [, argv] = GLib.shell_parse_argv(commandLine);
        spawn(argv);
    } catch (e) {
        debug(`invalid command '${commandLine}': ${e}`);
    }
}
