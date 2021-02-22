const EventEmitter = require('events');
const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer');
const minimist = require('minimist');
const { stopSpinner } = require('../lib/util/spinner');
const { error } = require('../lib/util/logger');
const { hasYarn, hasPnpm3OrLater } = require('../lib/util/env');
const chalk = require('chalk');
const { clearConsole } = require('../lib/util/clearConsole');
const validateProjectName = require('validate-npm-package-name');
const Creator = require('../lib/Creator');

module.exports = class Create extends EventEmitter {
  // 参数传递进来，冗余给继承类需要时使用
  constructor({ key, options, config }) {
    super();
  }

  async create({ key: projectName, options, config }) {
    this.emit('create', { event: 'create-start' });
    // 当前工作目录
    const cwd = options.cwd || process.cwd();
    // 项目名称为 . ，在当前目录下创建项目（隐藏功能么，vue-cli官网上居然没写。。。）
    const inCurrent = projectName === '.';
    const name = inCurrent ? path.relative('../', cwd) : projectName;
    const targetDir = path.resolve(cwd, projectName || '.');

    const result = validateProjectName(name);
    if (!result.validForNewPackages) {
      console.error(chalk.red(`工程名不符合npm包规则: "${name}"`));
      result.errors && result.errors.forEach(err => {
        console.error(chalk.red.dim('Error: ' + err));
      });
      result.warnings && result.warnings.forEach(warn => {
        console.error(chalk.red.dim('Warning: ' + warn));
      });
      // 原先为了测试不退出，抛出错误。目前没有单元测试，暂时改为程序退出
      process.exit(1);
    }

    if (fs.existsSync(targetDir) && !options.merge) {
      if (options.force) {
        await fs.remove(targetDir);
      } else {
        await clearConsole();
        if (inCurrent) {
          const { ok } = await inquirer.prompt([
            {
              name: 'ok',
              type: 'confirm',
              message: `在当前目录中生成项目吗？`
            }
          ]);
          if (!ok) {
            return;
          }
        } else {
          const { action } = await inquirer.prompt([
            {
              name: 'action',
              type: 'list',
              message: `目录 ${chalk.cyan(targetDir)} 已存在。请选择一种模式：`,
              choices: [
                { name: '合并', value: 'merge' },
                { name: '重写', value: 'overwrite' },
                { name: '取消', value: false }
              ]
            }
          ]);
          if (!action) {
            return;
          } else if (action === 'overwrite') {
            console.log(`\n正在删除 ${chalk.cyan(targetDir)}...`);
            await fs.remove(targetDir);
          }
        }
      }
    }

    const creator = new Creator(name, targetDir, this.config(), this.plugin);
    await creator.create(options);
    this.emit('create', { event: 'create-done' });
  }

  async plugin(obj) { }

  config() {
    const outroPrompts = [];
    const packageManagerChoices = [];
    packageManagerChoices.push({
      name: 'NPM',
      value: 'npm',
      short: 'NPM'
    });
    if (hasYarn()) {
      packageManagerChoices.push({
        name: 'Yarn',
        value: 'yarn',
        short: 'Yarn'
      });
    }
    if (hasPnpm3OrLater()) {
      packageManagerChoices.push({
        name: 'PNPM',
        value: 'pnpm',
        short: 'PNPM'
      });
    }
    outroPrompts.push({
      name: 'packageManager',
      type: 'list',
      message: '请选择安装依赖包的工具：',
      choices: packageManagerChoices,
    });
    outroPrompts.push({
      name: 'packageOrigin',
      type: 'list',
      message: '请选择远端下载源：',
      choices: [
        { name: 'taobao', value: 'taobao' },
        { name: 'yarn', value: 'yarn' },
        { name: 'npm', value: 'npm' },
      ],
    });
    return outroPrompts;
  }

  run(...args) {
    // app-name输入超过一个
    if (minimist(process.argv.slice(3))._.length > 1) {
      console.log(chalk.yellow('\n 警告: 您提供了多个app-name，第一个将作为应用名称，其余的将被忽略'));
    }
    // --git makes commander to default git to true
    if (process.argv.includes('-g') || process.argv.includes('--git')) {
      options.forceGit = true
    }
    return this.create(...args).catch(err => {
      stopSpinner(false); // do not persist
      error(err);
      if (!process.env.KUMA_TEST) {
        process.exit(1);
      }
    });
  }
};
