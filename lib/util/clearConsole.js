const { clearConsole } = require('./logger');
const chalk = require('chalk');
const semver = require('semver');
const getVersions = require('./getVersions');
const getGlobalInstallCommand = require('./getGlobalInstallCommand');

exports.generateTitle = async function(checkUpdate) {
  const { current, latest, error } = await getVersions();
  let title = chalk.bold.blue(`koa-bootstrap v${current}`);

  if (process.env.KUMA_TEST) {
    title += ' ' + chalk.blue.bold('TEST');
  }

  if (error) {
    title += '\n' + chalk.red('联网更新检查失败');
  }

  if (checkUpdate && !error && semver.gt(latest, current)) {
    let upgradeMessage = `koa-bootstrap有更新： ${chalk.redBright(current)} → ${chalk.green(latest)}`;

    try {
      // 判断当前命令是否运行在全局根目录下（需要依次访问yarn、pnpm、npm，速度有点慢，先禁用）
      // const command = getGlobalInstallCommand();
      let name = require('../../package.json').name;
      if (semver.prerelease(latest)) {
        name += '@next';
      }

      // if (command) {
      //   upgradeMessage +=
      //     `\n运行 ${chalk.yellow(`${command} ${name}`)} 进行升级！`
      // }
    } catch (e) { }

    const upgradeBox = require('boxen')(upgradeMessage, {
      align: 'center',
      borderColor: 'green',
      dimBorder: true,
      padding: 1
    });

    title += `\n${upgradeBox}\n`;
  }

  return title;
}

exports.clearConsole = async function clearConsoleWithTitle(checkUpdate) {
  const title = await exports.generateTitle(checkUpdate);
  clearConsole(title);
}
