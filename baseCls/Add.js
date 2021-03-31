/**
 * @file add基类
 * @author xiek(285985285@qq.com)
 */

const EventEmitter = require('events');
const chalk = require('chalk');
const minimist = require('minimist');
const { error, log, warn } = require('../lib/util/logger');
const { resolvePluginId } = require('../lib/util/pluginResolution');
const { resolveModule } = require('../lib/util/module');
const PackageManager = require('../lib/util/ProjectPackageManager');

module.exports = class Add extends EventEmitter {
  constructor() {
    super();
  }

  async #add(pluginToAdd, options, context = process.cwd()) {
    const pluginRe = /^(@?[^@]+)(?:@(.+))?$/;
    const [
      // eslint-disable-next-line
      _skip,
      pluginName,
      pluginVersion,
    ] = pluginToAdd.match(pluginRe);
    const packageName = resolvePluginId(pluginName);

    log();
    log(`📦  安装 ${chalk.cyan(packageName)}...`);
    log();

    const pm = new PackageManager({ context: context });

    if (options.dev) {
      warn(`当前处于开发模式，将会从本地 link 插件包`);
      await pm.link([packageName]);
    } else {
      if (pluginVersion) {
        await pm.add(`${packageName}@${pluginVersion}`);
      } else {
        await pm.add(packageName, { tilde: true });
      }
    }

    log(`${chalk.green('✔')}  插件安装成功: ${chalk.cyan(packageName)}`);
    log();

    const generatorPath = resolveModule(`${packageName}/generator`, context);
    if (generatorPath) {
      const runCls = new (this.getRunCls())();
      runCls.run(packageName, options, context);
    } else {
      log(`插件 ${packageName} 未找到需要调用的生成器`);
    }
  }

  getRunCls() {
    return require('./Run');
  }

  run(...args) {
    const [pluginToAdd, options] = args;
    return this.#add(pluginToAdd, minimist(process.argv.slice(3))).catch(
      err => {
        error(err);
        if (!process.env.KUMA_TEST) {
          process.exit(1);
        }
      }
    );
  }
};
