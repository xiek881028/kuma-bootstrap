/**
 * @file run基类
 * @author xiek(285985285@qq.com)
 */

const EventEmitter = require('events');
const inquirer = require('inquirer');
const chalk = require('chalk');
const minimist = require('minimist');
const { error, log, warn } = require('../lib/util/logger');
const { resolvePluginId } = require('../lib/util/pluginResolution');
const { loadModule } = require('../lib/util/module');
const PackageManager = require('../lib/util/ProjectPackageManager');
const confirmIfGitDirty = require('../lib/util/confirmIfGitDirty');
const readFiles = require('../lib/util/readFiles');
const getPkg = require('../lib/util/getPkg');
const Generator = require('../lib/util/Generator');
const { stopSpinner, logWithSpinner } = require('../lib/util/spinner');
const getChangedFiles = require('../lib/util/getChangedFiles');

// TODO 考虑 context 是否指向项目根路径，目前只能在根路径 run，否则项目报错
async function runGenerator(context, plugin, pkg = getPkg(context)) {
  const isTestOrDebug = process.env.KUMA_CLI_TEST || process.env.KUMA_CLI_DEBUG;
  const afterInvokeCbs = [];
  const afterAnyInvokeCbs = [];

  const generator = new Generator(context, {
    pkg,
    plugins: [plugin],
    files: await readFiles(context),
    afterInvokeCbs,
    afterAnyInvokeCbs,
    invoking: true,
  });

  log();
  log(`🚀  调用kuma插件 ${plugin.id}...`);
  await generator.generate();

  const newDeps = generator.pkg.dependencies;
  const newDevDeps = generator.pkg.devDependencies;
  const depsChanged =
    JSON.stringify(newDeps) !== JSON.stringify(pkg.dependencies) ||
    JSON.stringify(newDevDeps) !== JSON.stringify(pkg.devDependencies);

  if (!isTestOrDebug && depsChanged) {
    log(`📦  安装插件依赖包，请耐心等待...`);
    log();
    const pm = new PackageManager({ context });
    await pm.install();
  }

  if (afterInvokeCbs.length || afterAnyInvokeCbs.length) {
    logWithSpinner('⚓', `运行项目构建完成钩子...`);
    for (const cb of afterInvokeCbs) {
      await cb();
    }
    for (const cb of afterAnyInvokeCbs) {
      await cb();
    }
    stopSpinner();
    log();
  }

  log(`${chalk.green('✔')}  成功调用插件: ${chalk.cyan(plugin.id)}`);
  const changedFiles = getChangedFiles(context);
  if (changedFiles.length) {
    log(`   以下文件已更新 / 添加:\n`);
    log(chalk.red(changedFiles.map(line => `     ${line}`).join('\n')));
    log();
    log(`   你可以通过以下命令查看修改 ${chalk.cyan('git diff')} 并提交`);
    log();
  }

  generator.printExitLogs();
}

module.exports = class Run extends EventEmitter {
  constructor() {
    super();
  }

  async #run(pluginName, options, context = process.cwd()) {
    if (!(await confirmIfGitDirty(context))) {
      return;
    }

    delete options._;
    const pkg = getPkg(context);

    // attempt to locate the plugin in package.json
    const findPlugin = deps => {
      if (!deps) return;
      let name;
      // official
      if (deps[(name = `@kuma/cli-plugin-${pluginName}`)]) {
        return name;
      }
      // full id, scoped short, or default short
      if (deps[(name = resolvePluginId(pluginName))]) {
        return name;
      }
    };

    let id = '';
    if (options.dev) {
      warn(`当前处于开发模式，将会忽略package.json检查`);
      id = resolvePluginId(pluginName);
    } else {
      id = findPlugin(pkg.devDependencies) || findPlugin(pkg.dependencies);
    }
    if (!id) {
      throw new Error(
        `未能在package.json加载插件 ${chalk.yellow(pluginName)}。` +
          `是否忘记安装了？`
      );
    }

    const pluginGenerator = loadModule(`${id}/generator`, context);
    if (!pluginGenerator) {
      throw new Error(`插件 ${id} 未找到需要调用的生成器`);
    }

    // resolve options if no command line options (other than --registry) are passed,
    // and the plugin contains a prompt module.
    // eslint-disable-next-line prefer-const
    let { registry, $inlineOptions, ...pluginOptions } = options;
    // 删除 dev 标识以绕开后续检查
    delete pluginOptions.dev;
    if ($inlineOptions) {
      try {
        pluginOptions = JSON.parse($inlineOptions);
      } catch (e) {
        throw new Error(`无法解析内联JSON选项: ${e.message}`);
      }
    } else if (!Object.keys(pluginOptions).length) {
      let pluginPrompts = loadModule(`${id}/prompts`, context);
      if (pluginPrompts) {
        const prompt = inquirer.createPromptModule();

        if (typeof pluginPrompts === 'function') {
          pluginPrompts = pluginPrompts(pkg, prompt);
        }
        if (typeof pluginPrompts.getPrompts === 'function') {
          pluginPrompts = pluginPrompts.getPrompts(pkg, prompt);
        }
        pluginOptions = await prompt(pluginPrompts);
      }
    }

    const plugin = {
      id,
      apply: pluginGenerator,
      options: {
        registry,
        ...pluginOptions,
      },
    };

    await runGenerator(context, plugin, pkg);
  }

  run(...args) {
    const [pluginName, options] = args;
    return this.#run(pluginName, minimist(process.argv.slice(3))).catch(err => {
      error(err);
      if (!process.env.KUMA_TEST) {
        process.exit(1);
      }
    });
  }
};

module.exports.runGenerator = runGenerator;
