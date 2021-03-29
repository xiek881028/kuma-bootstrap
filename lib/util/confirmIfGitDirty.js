const inquirer = require('inquirer');
const { hasProjectGit } = require('./env');
const execa = require('execa');
const { warn } = require('./logger');

module.exports = async function confirmIfGitDirty(context) {
  if (process.env.KUMA_CLI_SKIP_DIRTY_GIT_PROMPT) {
    return true;
  }

  process.env.KUMA_CLI_SKIP_DIRTY_GIT_PROMPT = true;

  if (!hasProjectGit(context)) {
    return true;
  }

  const { stdout } = await execa('git', ['status', '--porcelain'], {
    cwd: context,
  });
  if (!stdout) {
    return true;
  }

  warn(
    `检测到git有未提交的更改，建议先提交或储存它们。`
  );
  const { ok } = await inquirer.prompt([
    {
      name: 'ok',
      type: 'confirm',
      message: '继续吗？',
      default: false,
    },
  ]);
  return ok;
};
