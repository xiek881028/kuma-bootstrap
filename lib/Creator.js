const EventEmitter = require('events');
const cloneDeep = require('lodash.clonedeep');
const inquirer = require('inquirer');
const chalk = require('chalk');
const execa = require('execa');
const { log, warn } = require('./util/logger');
const { clearConsole } = require('./util/clearConsole');
const { hasYarn, hasPnpm3OrLater, hasPnpmVersionOrLater, hasGit, hasProjectGit } = require('./util/env');
const PackageManager = require('./util/ProjectPackageManager');
const { resolvePkg } = require('./util/pkg');
const { loadModule } = require('./util/module');
const writeFileTree = require('./util/writeFileTree');
const Generator = require('./util/Generator');
const debug = require('debug');

module.exports = class Creator extends EventEmitter {
  constructor(name, context, prompts, pluginFn) {
    super();

    this.name = name;
    this.context = process.env.KUMA_CLI_CONTEXT = context;
    // const { presetPrompt, featurePrompt } = this.resolveIntroPrompts();
    // 插件安装处理方法统一由外部传入
    this.plugin = {};
    this.pluginFn = pluginFn;
    // this.presetPrompt = presetPrompt;
    // this.featurePrompt = featurePrompt;
    this.outroPrompts = prompts;
    this.injectedPrompts = [];
    this.promptCompleteCbs = [];
    this.afterInvokeCbs = [];
    this.afterAnyInvokeCbs = [];

    this.run = this.run.bind(this);

    // const promptAPI = new PromptModuleAPI(this)
    // promptModules.forEach(m => m(promptAPI))
  }

  async create(cliOptions = {}) {
    let preset = await this.promptAndResolvePreset();
    // 变异前先克隆，为了防止之后对象被改变
    preset = cloneDeep(preset);
    const isTestOrDebug = process.env.KUMA_TEST;
    const { name, context, run } = this;

    const packageManager = (
      preset.packageManager ||
      (hasYarn() ? 'yarn' : null) ||
      (hasPnpm3OrLater() ? 'pnpm' : 'npm')
    );

    await clearConsole();
    // 前置pluginFn，因为this.plugin内的插件需要提前写入package.json
    await this.pluginFn(this.plugin, { preset, cliOptions });

    log(`✨  开始在${chalk.yellow(context)}创建项目。`);
    this.emit('creation', { event: 'creating' });

    // generate package.json with plugin dependencies
    const pkg = {
      name,
      version: '0.1.0',
      private: true,
      devDependencies: {},
      ...resolvePkg(context),
    };
    // 忽略readme
    delete pkg.readme;

    const deps = Object.keys(this.plugin);
    const linkPkg = [];
    deps.forEach(dep => {
      // 忽略预设包
      if (this.plugin[dep]._isPreset) {
        return;
      }

      if (this.plugin[dep].link) {
        linkPkg.push(dep);
      } else {
        pkg.devDependencies[dep] = (this.plugin[dep].version || `latest`);
      }
    });

    // write package.json
    await writeFileTree(context, {
      'package.json': JSON.stringify(pkg, null, 2)
    });

    // generate a .npmrc file for pnpm, to persist the `shamefully-flatten` flag
    if (packageManager === 'pnpm') {
      const pnpmConfig = hasPnpmVersionOrLater('4.0.0')
        ? 'shamefully-hoist=true\n'
        : 'shamefully-flatten=true\n';

      await writeFileTree(context, {
        '.npmrc': pnpmConfig
      });
    }

    // intilaize git repository before installing deps
    // so that vue-cli-service can setup git hooks.
    this.shouldInitGitFlag = this.shouldInitGit(cliOptions);
    if (this.shouldInitGitFlag) {
      log(`🗃  初始化git仓库...`);
      this.emit('creation', { event: 'git-init' });
      await run('git init');
    }

    const pm = new PackageManager({ context, forcePackageManager: packageManager, origin: preset.packageOrigin });

    // install plugins
    log(`⚙\u{fe0f}  安装依赖包，请耐心等待...`);
    log();
    this.emit('creation', { event: 'plugins-install' });
    // await pm.install();
    log(`⚙\u{fe0f}  链接依赖包，请耐心等待...`);
    log();
    await pm.link(linkPkg);

    // run generator
    log(`🚀  安装kuma插件...`)
    this.emit('creation', { event: 'invoking-generators' })
    const plugins = await this.resolvePlugins(this.plugin, pkg);
    const generator = new Generator(this.context, {
      pkg,
      plugins,
      afterInvokeCbs: this.afterInvokeCbs,
      afterAnyInvokeCbs: this.afterAnyInvokeCbs,
    });
    await generator.generate();

    // 安装插件依赖的依赖包
    log(`📦  安装插件依赖包，请耐心等待...`);
    log();
    this.emit('creation', { event: 'deps-install' });
    if (!isTestOrDebug) {
      // await pm.install();
    }


    // run complete cbs if any (injected by generators)
    log(`⚓  运行项目构建完成钩子...`);
    this.emit('creation', { event: 'completion-hooks' });
    for (const cb of this.afterInvokeCbs) {
      await cb();
    }
    for (const cb of this.afterAnyInvokeCbs) {
      await cb();
    }

    // commit initial state
    let gitCommitFailed = false;
    if (this.shouldInitGitFlag) {
      await run('git add -A');
      if (isTestOrDebug) {
        await run('git', ['config', 'user.name', 'test']);
        await run('git', ['config', 'user.email', 'test@test.com']);
        await run('git', ['config', 'commit.gpgSign', 'false']);
      }
      const msg = typeof cliOptions.git === 'string' ? cliOptions.git : 'init';
      try {
        await run('git', ['commit', '-m', msg, '--no-verify']);
      } catch (e) {
        gitCommitFailed = true;
      }
    }

    if (gitCommitFailed) {
      warn(
        `由于git config缺少必要的 username 或 email，导致commit失败。\n` +
        `您需要自己初始化提交。\n`
      );
    }

    // log instructions
    log();
    log(`🎉  项目 ${chalk.yellow(name)} 创建成功。`);
    log();
    this.emit('creation', { event: 'done' });

    generator.printExitLogs();
  }

  // { id: options } => [{ id, apply, options }]
  async resolvePlugins(rawPlugins, pkg) {
    const plugins = [];
    for (const id of Object.keys(rawPlugins)) {
      const apply = loadModule(`${id}/generator`, this.context) || (() => { });
      let options = rawPlugins[id] || {};

      if (options.prompts) {
        let pluginPrompts = loadModule(`${id}/prompts`, this.context);

        if (pluginPrompts) {
          const prompt = inquirer.createPromptModule();

          if (typeof pluginPrompts === 'function') {
            pluginPrompts = pluginPrompts(pkg, prompt);
          }
          if (typeof pluginPrompts.getPrompts === 'function') {
            pluginPrompts = pluginPrompts.getPrompts(pkg, prompt);
          }

          log();
          log(`${chalk.cyan(options._isPreset ? `Preset options:` : id)}`);
          options = await prompt(pluginPrompts);
        }
      }

      plugins.push({ id, apply, options });
    }
    return plugins;
  }

  run(command, args) {
    if (!args) { [command, ...args] = command.split(/\s+/) };
    return execa(command, args, { cwd: this.context });
  }

  async promptAndResolvePreset(answers = null) {
    if (!answers) {
      await clearConsole(true);
      answers = await inquirer.prompt(this.outroPrompts);
      debug('kuma:cli-answers')(answers);
      return answers;
    }
  }

  shouldInitGit(cliOptions) {
    if (!hasGit()) {
      return false;
    }
    // --git
    if (cliOptions.forceGit) {
      return true;
    }
    // --no-git
    if (cliOptions.git === false || cliOptions.git === 'false') {
      return false;
    }
    // default: true unless already in a git repo
    return !hasProjectGit(this.context);
  }
};
