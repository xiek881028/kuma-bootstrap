// const ejs = require('ejs')
const debug = require('debug');
const GeneratorAPI = require('./GeneratorAPI');
const PackageManager = require('./ProjectPackageManager');
const sortObject = require('./sortObject');
const writeFileTree = require('./writeFileTree');
const normalizeFilePaths = require('./normalizeFilePaths');
const semver = require('semver');
const { loadModule } = require('./module');
const {
  isPlugin,
  toShortPluginId,
  matchesPluginId,
} = require('./pluginResolution');
// const ConfigTransform = require('./ConfigTransform');

const logger = require('./logger');
const logTypes = {
  log: logger.log,
  info: logger.info,
  done: logger.done,
  warn: logger.warn,
  error: logger.error
}

// const defaultConfigTransforms = {
//   babel: new ConfigTransform({
//     file: {
//       js: ['babel.config.js']
//     }
//   }),
//   postcss: new ConfigTransform({
//     file: {
//       js: ['postcss.config.js'],
//       json: ['.postcssrc.json', '.postcssrc'],
//       yaml: ['.postcssrc.yaml', '.postcssrc.yml']
//     }
//   }),
//   eslintConfig: new ConfigTransform({
//     file: {
//       js: ['.eslintrc.js'],
//       json: ['.eslintrc', '.eslintrc.json'],
//       yaml: ['.eslintrc.yaml', '.eslintrc.yml']
//     }
//   }),
//   jest: new ConfigTransform({
//     file: {
//       js: ['jest.config.js']
//     }
//   }),
//   browserslist: new ConfigTransform({
//     file: {
//       lines: ['.browserslistrc']
//     }
//   })
// };

// const ensureEOL = str => {
//   if (str.charAt(str.length - 1) !== '\n') {
//     return str + '\n';
//   }
//   return str;
// };

/**
 * Collect created/modified files into set
 * @param {Record<string,string|Buffer>} files
 * @param {Set<string>} set
 */
const watchFiles = (files, set) => {
  return new Proxy(files, {
    set(target, key, value, receiver) {
      set.add(key);
      return Reflect.set(target, key, value, receiver);
    },
    deleteProperty(target, key) {
      set.delete(key);
      return Reflect.deleteProperty(target, key);
    }
  });
};

module.exports = class Generator {
  constructor(context, {
    pkg = {},
    plugins = [],
    afterInvokeCbs = [],
    afterAnyInvokeCbs = [],
    files = {},
    invoking = false
  } = {}) {
    this.context = context;
    this.plugins = plugins;
    this.originalPkg = pkg;
    this.pkg = Object.assign({}, pkg);
    this.pm = new PackageManager({ context });
    this.imports = {};
    this.rootOptions = {};
    this.afterInvokeCbs = afterInvokeCbs;
    this.afterAnyInvokeCbs = afterAnyInvokeCbs;
    this.configTransforms = {};
    // this.defaultConfigTransforms = defaultConfigTransforms;
    this.invoking = invoking;
    // for conflict resolution
    this.depSources = {};
    // virtual file tree
    this.files = Object.keys(files).length
      // when execute `vue add/invoke`, only created/modified files are written to disk
      ? watchFiles(files, this.filesModifyRecord = new Set())
      // all files need to be written to disk
      : files;
    this.fileMiddlewares = [];
    this.postProcessFilesCbs = [];
    // exit messages
    this.exitLogs = [];

    // load all the other plugins
    this.allPluginIds = Object.keys(this.pkg.dependencies || {})
      .concat(Object.keys(this.pkg.devDependencies || {}))
      .filter(isPlugin);
  }

  async initPlugins() {
    const { invoking } = this;
    const pluginIds = this.plugins.map(p => p.id);

    // avoid modifying the passed afterInvokes, because we want to ignore them from other plugins
    const passedAfterInvokeCbs = this.afterInvokeCbs;
    this.afterInvokeCbs = [];
    // apply hooks from all plugins to collect 'afterAnyHooks'
    for (const id of this.allPluginIds) {
      const api = new GeneratorAPI(id, this, {});
      const pluginGenerator = loadModule(`${id}/generator`, this.context);

      if (pluginGenerator && pluginGenerator.hooks) {
        await pluginGenerator.hooks(api, {}, pluginIds);
      }
    }

    // We are doing save/load to make the hook order deterministic
    // save "any" hooks
    const afterAnyInvokeCbsFromPlugins = this.afterAnyInvokeCbs;

    // reset hooks
    this.afterInvokeCbs = passedAfterInvokeCbs;
    this.afterAnyInvokeCbs = [];
    this.postProcessFilesCbs = [];

    // apply generators from plugins
    for (const plugin of this.plugins) {
      const { id, apply, options } = plugin;
      const api = new GeneratorAPI(id, this, options);
      await apply(api, options, invoking);

      if (apply.hooks) {
        // while we execute the entire `hooks` function,
        // only the `afterInvoke` hook is respected
        // because `afterAnyHooks` is already determined by the `allPluginIds` loop above
        await apply.hooks(api, options, pluginIds);
      }
    }
    // restore "any" hooks
    this.afterAnyInvokeCbs = afterAnyInvokeCbsFromPlugins;
  }

  async generate() {
    await this.initPlugins();

    // 在应用插件进行比较之前保存文件系统
    const initialFiles = Object.assign({}, this.files);
    // 等待文件解析
    await this.resolveFiles();
    // 设置package.json
    this.sortPkg();
    this.files['package.json'] = JSON.stringify(this.pkg, null, 2) + '\n';
    // 将文件树写入/更新到磁盘
    await writeFileTree(this.context, this.files, initialFiles, this.filesModifyRecord);
  }

  sortPkg() {
    // ensure package.json keys has readable order
    this.pkg.dependencies = sortObject(this.pkg.dependencies);
    this.pkg.devDependencies = sortObject(this.pkg.devDependencies);
    this.pkg.scripts = sortObject(this.pkg.scripts);
    this.pkg = sortObject(this.pkg, [
      'name',
      'version',
      'private',
      'description',
      'author',
      'scripts',
      'main',
      'module',
      'browser',
      'jsDelivr',
      'unpkg',
      'files',
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'babel',
      'eslintConfig',
      'prettier',
      'postcss',
      'browserslist',
      'jest'
    ]);

    debug('kuma:cli-pkg')(this.pkg);
  }

  async resolveFiles() {
    const files = this.files;
    // for (const middleware of this.fileMiddlewares) {
    //   await middleware(files, ejs.render);
    // }

    // normalize file paths on windows
    // all paths are converted to use / instead of \
    normalizeFilePaths(files);

    // handle imports and root option injections
    // Object.keys(files).forEach(file => {
    // });

    for (const postProcess of this.postProcessFilesCbs) {
      await postProcess(files);
    }
    debug('kuma:cli-files')(this.files);
  }

  hasPlugin(id, versionRange) {
    const pluginExists = [
      ...this.plugins.map(p => p.id),
      ...this.allPluginIds
    ].some(pid => matchesPluginId(id, pid));

    if (!pluginExists) {
      return false;
    }

    if (!versionRange) {
      return pluginExists;
    }

    return semver.satisfies(
      this.pm.getInstalledVersion(id),
      versionRange
    );
  }

  printExitLogs() {
    if (this.exitLogs.length) {
      this.exitLogs.forEach(({ id, msg, type }) => {
        const shortId = toShortPluginId(id);
        const logFn = logTypes[type];
        if (!logFn) {
          logger.error(`无效的 api.exitLog 类型 '${type}'.`, shortId);
        } else {
          logFn(msg, msg && shortId);
        }
      });
      logger.log();
    }
  }
}
