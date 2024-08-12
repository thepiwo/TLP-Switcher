import St from 'gi://St';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const PROFILE_DIR = '/.tlp/';

const TLPButton = GObject.registerClass({
        Properties: {
            'path': GObject.ParamSpec.string(
                'path',
                'Path String',
                'Path String',
                GObject.ParamFlags.READWRITE,
                null
            ),
        },
    },
    class TLPButton extends PanelMenu.Button {
        _init(name, path) {
            super._init(0.0, name, false);
            this._path = path;
            this.notify('path');

            // Panel icon
            this.add_child(new St.Icon({
                icon_name: 'applications-science-symbolic',
                style_class: 'system-status-icon'
            }));

            // Popup menu title
            let itemTitle = new PopupMenu.PopupMenuItem('TLP Profile');
            itemTitle.actor.reactive = false;

            let menuTitle = new PopupMenu.PopupMenuSection();
            menuTitle.addMenuItem(itemTitle);

            this.menu.addMenuItem(menuTitle);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // Popup menu profiles
            this._menuProfiles = new PopupMenu.PopupMenuSection();
            this.menu.addMenuItem(this._menuProfiles);

            this._itemProfiles = null;
            this._profileDir = GLib.get_home_dir() + PROFILE_DIR;

            this.menu.connect('open-state-changed', (menu, open) => {
                if (open) {
                    this._updateProfiles();
                }
            });
        }

        _updateProfiles() {
            // Clear existing profiles
            this._menuProfiles.removeAll();

            // List profiles
            let output = GLib.spawn_command_line_sync('ls ' + this._profileDir);
            this._profiles = output[1].toString().split('\n');
            this._profiles.pop();

            // Create directory if it doesn't exist
            if (output[2].toString().indexOf('No such file or directory') !== -1) {
                GLib.spawn_command_line_async('mkdir ' + this._profileDir);
            }

            let len = this._profiles.length;
            if (len > 0) {
                // Construct profiles menu
                this._itemProfiles = [];
                for (let i = 0; i < len; ++i) {
                    let p = new PopupMenu.PopupMenuItem(this._profiles[i]);
                    p.id = i;
                    p.connect('activate', () => {
                        this._activate(p.id);
                    });

                    this._itemProfiles[i] = p;
                    this._menuProfiles.addMenuItem(p);
                }

                // Determine current profile
                this._checkActive();
            } else {
                // No profiles
                let item = new PopupMenu.PopupMenuItem('No profiles in ~/.tlp');
                item.actor.reactive = false;
                this._menuProfiles.addMenuItem(item);
            }
        }

        _activate(index) {
            // Update active ornament
            for (let i = 0; i < this._itemProfiles.length; ++i) {
                this._itemProfiles[i].setOrnament(PopupMenu.Ornament.NONE);
            }
            this._itemProfiles[index].setOrnament(PopupMenu.Ornament.DOT);

            // Run tlp update script
            let script = this._path + '/tlp_update.sh';
            let [parsed, args] =
                GLib.shell_parse_argv('/usr/bin/pkexec /bin/bash '.concat(script, ' \'', this._profileDir, this._profiles[index], '\''));
            if (parsed) {
                Util.spawn(args);
            }
        }

        _checkActive() {
            if (this._profiles.length === 0) return;

            let config = GLib.spawn_command_line_sync('tlp-stat -c')[1].toString().split('\n');
            let profile;

            for (let i = 0; i < this._profiles.length; ++i) {
                profile = GLib.spawn_command_line_sync('cat \''.concat(this._profileDir, this._profiles[i], '\''))[1].toString().split('\n');

                if (this._profileMatch(config, profile)) {
                    this._itemProfiles[i].setOrnament(PopupMenu.Ornament.DOT);
                    break;
                }
            }
        }

        _profileMatch(config, profile) {
            const stripDefaultsFromConfig = function (config) {
                const regex = new RegExp('(^.*L[0-9]{4}: )|(")|(^ *)|( *$)', 'g');

                let nonDefaults = [];
                for (let i = 0; i < config.length; i++) {
                    let line = config[i];

                    // Ignore any default values, comments, or empty lines
                    if (line.startsWith('defaults.conf') || line.startsWith('-') || line.startsWith('+') || line.match(/^ *$/) || line.startsWith('#')) {
                        continue;
                    }

                    nonDefaults.push(line.replace(regex, ''));
                }

                return nonDefaults.sort();
            };

            // Strip any unnecessary information before comparison
            config = stripDefaultsFromConfig(config);
            profile = stripDefaultsFromConfig(profile);

            if (config.length !== profile.length) {
                return false;
            }

            return config.every((v, i) => v === profile[i]);
        }
    }
);

export default class TlpSwitcherExtension extends Extension {
    button;

    enable() {
        this.button = new TLPButton(this.metadata.name, this.metadata.path);
        Main.panel.addToStatusArea('ID-TLPSwitcher', this.button);
    }

    disable() {
        this.button.destroy();
    }
}


