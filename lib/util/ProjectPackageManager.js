const execa = require('execa');
const semver = require('semver');
const minimist = require('minimist');
const stripAnsi = require('strip-ansi');
const pMap = require('p-map');
const registries = require('./registries');
const { executeCommand } = require('./executeCommand');
const { hasProjectYarn, hasProjectPnpm, hasProjectNpm, hasPnpmVersionOrLater, hasYarn, hasPnpm3OrLater } = require('./env');
const { log, warn } = require('./logger');

const SUPPORTED_PACKAGE_MANAGERS = ['yarn', 'pnpm', 'npm']
const PACKAGE_MANAGER_PNPM4_CONFIG = {
  install: ['install', '--reporter', 'silent', '--shamefully-hoist'],
  add: ['install', '--reporter', 'silent', '--shamefully-hoist'],
  upgrade: ['update', '--reporter', 'silent'],
  remove: ['uninstall', '--reporter', 'silent']
}
const PACKAGE_MANAGER_PNPM3_CONFIG = {
  install: ['install', '--loglevel', 'error', '--shamefully-flatten'],
  add: ['install', '--loglevel', 'error', '--shamefully-flatten'],
  upgrade: ['update', '--loglevel', 'error'],
  remove: ['uninstall', '--loglevel', 'error']
}
const PACKAGE_MANAGER_CONFIG = {
  npm: {
    install: ['install', '--loglevel', 'error'],
    add: ['install', '--loglevel', 'error'],
    upgrade: ['update', '--loglevel', 'error'],
    remove: ['uninstall', '--loglevel', 'error']
  },
  pnpm: hasPnpmVersionOrLater('4.0.0') ? PACKAGE_MANAGER_PNPM4_CONFIG : PACKAGE_MANAGER_PNPM3_CONFIG,
  yarn: {
    install: [],
    add: ['add'],
    upgrade: ['upgrade'],
    remove: ['remove']
  }
}

class PackageManager {
  constructor({ context, forcePackageManager, origin } = {}) {
    this.origin = origin
    this.context = context || process.cwd();
    this._registries = {};

    // 指定安装工具
    if (forcePackageManager) {
      this.bin = forcePackageManager;
    } else if (context) {
      if (hasProjectYarn(context)) {
        this.bin = 'yarn';
      } else if (hasProjectPnpm(context)) {
        this.bin = 'pnpm';
      } else if (hasProjectNpm(context)) {
        this.bin = 'npm';
      }
    }

    // if no package managers specified, and no lockfile exists
    if (!this.bin) {
      this.bin = hasYarn() ? 'yarn' : hasPnpm3OrLater() ? 'pnpm' : 'npm';
    }

    if (this.bin === 'npm') {
      // npm doesn't support package aliases until v6.9
      const MIN_SUPPORTED_NPM_VERSION = '6.9.0';
      const npmVersion = stripAnsi(execa.sync('npm', ['--version']).stdout);

      if (semver.lt(npmVersion, MIN_SUPPORTED_NPM_VERSION)) {
        throw new Error(
          `kuma-bootstrap需要的最低npm版本为6.9.0。您当前的npm版本为${npmVersion}，请升级。`
        );
      }

      if (semver.gte(npmVersion, '7.0.0')) {
        this.needsPeerDepsFix = true;
      }
    }

    if (!SUPPORTED_PACKAGE_MANAGERS.includes(this.bin)) {
      log();
      warn(
        `您选择的安装工具没有官方支持，将使用npm进行安装。`
      );
      PACKAGE_MANAGER_CONFIG[this.bin] = PACKAGE_MANAGER_CONFIG.npm;
    }

    // // Plugin may be located in another location if `resolveFrom` presents.
    // const projectPkg = resolvePkg(this.context)
    // const resolveFrom = projectPkg && projectPkg.vuePlugins && projectPkg.vuePlugins.resolveFrom

    // // Logically, `resolveFrom` and `context` are distinct fields.
    // // But in Vue CLI we only care about plugins.
    // // So it is fine to let all other operations take place in the `resolveFrom` directory.
    // if (resolveFrom) {
    //   this.context = path.resolve(context, resolveFrom)
    // }
  }

  async install() {
    const args = [];

    if (this.needsPeerDepsFix) {
      args.push('--legacy-peer-deps');
    }

    if (process.env.KUMA_TEST) {
      args.push('--silent', '--no-progress');
    }

    return await this.runCommand('install', args);
  }

  async link(arr = []) {
    await pMap(arr, async pkg => await executeCommand(
      this.bin,
      ['link', pkg],
      this.context
    ), { concurrency: 4 });
  }

  // Any command that implemented registry-related feature should support
  // `-r` / `--registry` option
  async getRegistry(scope) {
    const cacheKey = scope || '';
    if (this._registries[cacheKey]) {
      return this._registries[cacheKey];
    }

    const args = minimist(process.argv, {
      alias: {
        r: 'registry'
      }
    });

    const registry = args.registry ?? registries[this.origin] ?? this.origin;
    this._registries[cacheKey] = stripAnsi(registry).trim();
    return this._registries[cacheKey];
  }

  async setRegistryEnvs() {
    const registry = await this.getRegistry();

    process.env.npm_config_registry = registry;
    process.env.YARN_NPM_REGISTRY_SERVER = registry;

    // set mirror urls for users in china（逻辑较复杂，暂时去除，有问题再加上）
    // this.setBinaryMirrors();
  }

  async runCommand(command, args) {
    const prevNodeEnv = process.env.NODE_ENV;
    // In the use case of Vue CLI, when installing dependencies,
    // the `NODE_ENV` environment variable does no good;
    // it only confuses users by skipping dev deps (when set to `production`).
    delete process.env.NODE_ENV;

    await this.setRegistryEnvs();
    await executeCommand(
      this.bin,
      [
        ...PACKAGE_MANAGER_CONFIG[this.bin][command],
        ...(args || []),
      ],
      this.context
    );

    if (prevNodeEnv) {
      process.env.NODE_ENV = prevNodeEnv;
    }
  }
}

module.exports = PackageManager;
