/// <reference path="./types.d.ts" />
const NamespaceLogger = require('./NamespaceLogger');

/**
 * Base handler for ioBroker Plugins
 */
class PluginHandler {
    /**
     * Constructor for PluginHandler
     *
     * @param {import("@iobroker/plugin-base/types").PluginSettings} settings
     */
    constructor(settings) {
        this.settings = settings;
        this.log = new NamespaceLogger(this.settings.logNamespace, settings.log);

        this.plugins = {};
    }

    /**
     * Add plugins to the handler, resolve and require the plugin code and create instance
     *
     * @param {Record<string, any>} configs object with keys for plugin names and their configuration
     * @param {string | string[]} resolveDirs Resolve directories for plugins
     */
    addPlugins(configs, resolveDirs) {
        if (!configs) return;
        Object.keys(configs).forEach(plugin => {
            this.instanciatePlugin(plugin, configs[plugin], resolveDirs);
        });
    }

    /**
     * Resole, Require and Instanciate Plugins
     *
     * @param {string} name name of the plugin
     * @param {Record<string, any>} config plugin configuration
     * @param {string | string[]} resolveDirs Resolve directories
     */
    instanciatePlugin(name, config, resolveDirs) {
        if (this.plugins[name] && this.plugins[name].instance) {
            this.log.info('Ignore duplicate plugin ' + name);
            return;
        }

        if (resolveDirs && !Array.isArray(resolveDirs)) {
            resolveDirs = [resolveDirs];
        }

        const pluginPath = require.resolve('@iobroker/plugin-' + name, {
            paths: resolveDirs
        });
        if (!pluginPath) {
            this.log.info('Plugin ' + name + ' could not be resolved');
            return;
        }

        let ResolvedPlugin;
        try {
            ResolvedPlugin = require(pluginPath);
        } catch (err) {
            this.log.info('Plugin ' + name + ' could not be required: ' + err);
            return;
        }

        const pluginSettings = {
            pluginScope: this.settings.scope,
            pluginNamespace: this.settings.namespace + '.plugins.' + name,
            pluginLogNamespace: this.settings.logNamespace + ' Plugin ' + name,
            log: this.settings.log,
            iobrokerConfig: this.settings.iobrokerConfig,
            parentPackage: this.settings.parentPackage, // package.json from "parent" which uses the plugin (adapter/controller)
            controllerVersion: this.settings.controllerVersion
        };
        this.plugins[name] = {
            config: config
        };

        try {
            this.plugins[name].instance = new ResolvedPlugin(pluginSettings);
        } catch (err) {
            this.log.info('Plugin ' + name + ' could not be initialized: ' + err);
            this.plugins[name].instance = null;
        }
    }

    /**
     * Set Objects and States databases for all isActive plugins
     *
     * @param {string} name name of the plugin
     * @param {obj} objectsDb objects DB instance
     * @param {obj} statesDb states DB instance
     */
    setDatabaseForPlugin(name, objectsDb, statesDb) {
        this.plugins[name] && this.plugins[name].instance && this.plugins[name].instance.setDatabase(objectsDb, statesDb);
    }

    /**
     * Set Objects and States databases for all isActive plugins
     *
     * @param {obj} objectsDb objects DB instance
     * @param {obj} statesDb states DB instance
     */
    setDatabaseForPlugins(objectsDb, statesDb) {
        Object.keys(this.plugins).forEach(plugin => this.setDatabaseForPlugin(plugin, objectsDb, statesDb));
    }

    /**
     * Initialize one Plugins
     *
     * @param {string} name name of the plugin
     * @param {Record<string, any>} parentConfig io-package of the parent module that uses the plugins (adapter/controller)
     * @param {(error?: string) => void} [callback] callback function which is called after initialization is done for all plugins
     */
    initPlugin(name, parentConfig, callback) {
        if (!this.plugins[name].instance) {
            typeof callback === 'function' && callback('Please instanciate plugin first!');
            return;
        }
        this.plugins[name].instance.initPlugin(this.plugins[name].config, parentConfig, (err, initSuccessful) => {
            if (err || !initSuccessful) {
                this.log.debug('Plugin ' + name + ' destroyed because not initialized correctly');

                this.plugins[name].instance.destroy();
                delete this.plugins[name].instance;
            }
            typeof callback === 'function' && callback();
        })
    }

    /**
     * Initialize all Plugins that are registered
     *
     * @param {Record<string, any>} parentConfig io-package of the parent module that uses the plugins (adapter/controller)
     * @param {(error?: string) => void} callback callback function which is called after initialization is done for all plugins
     */
    initPlugins(parentConfig, callback) {
        let callbackCnt = 0;
        Object.keys(this.plugins).forEach(plugin => {
            if (!this.plugins[plugin].instance) return;
            callbackCnt++;
            this.initPlugin(plugin, parentConfig, () => !--callbackCnt && typeof callback === 'function' && callback());
        });
        callbackCnt === 0 && typeof callback === 'function' && callback();
    }

    /**
     * Destroy one plugin instance
     *
     * @param {string} name name of the plugin to destroy
     * @param {boolean} [force] true to consider plugin as destroyed also if false is returned from plugin
     */
    destroy(name, force) {
        if (this.plugins[name].instance) {
            if (this.plugins[name].instance.destroy() || force) {
                this.log.debug('Plugin ' + name + ' destroyed');
                !force && this.plugins[name].instance.setActive(false);
                delete this.plugins[name].instance;
                return true;
            } else {
                this.log.info('Plugin ' + name + ' could not be destroyed');
                return false;
            }
        }
        return true;
    }

    /**
     * Destroy all plugin instances
     */
    destroyAll() {
        Object.keys(this.plugins).forEach(plugin => {
            this.destroy(plugin, true);
        });
    }

    /**
     * Return plugin instance
     *
     * @param {string} name name of the plugin to return
     * @returns {object} plugin instance or null if not existent or not isActive
     */
    getPluginInstance(name) {
        if (!this.plugins[name] || !this.plugins[name].instance) {
            return null;
        }
        return this.plugins[name].instance;
    }

    /**
     * Return plugin configuration
     *
     * @param {string} name name of the plugin to return
     * @returns {object} plugin configuration or null if not existent or not isActive
     */
    getPluginConfig(name) {
        if (!this.plugins[name] || !this.plugins[name].config) {
            return null;
        }
        return this.plugins[name].config;
    }

    /**
     * Return if plugin exists
     *
     * @param {string} name name of the plugin to check
     * @returns {boolean} true/false if plugin was configured somewhere
     */
    pluginExists(name) {
        return !!this.plugins[name];
    }

    /**
     * Return if plugin is isActive
     *
     * @param {string} name name of the plugin to check
     * @returns {boolean} true/false if plugin is successfully isActive
     */
    isPluginInstanciated(name) {
        return !!(this.plugins[name] && this.plugins[name].instance);
    }

    /**
     * Return if plugin is active
     *
     * @param {string} name name of the plugin to check
     * @returns {boolean} true/false if plugin is successfully isActive
     */
    isPluginActive(name) {
        return !!(this.plugins[name] && this.plugins[name].instance && this.plugins[name].instance.isActive);
    }
}

module.exports = PluginHandler;