const { hasProjectGit } = require('./env');
const execa = require('execa');

module.exports = async function getChangedFiles(context, ops = ['-o', '-m']) {
  if (!hasProjectGit(context)) return [];

  const { stdout } = await execa(
    'git',
    ['ls-files', '--exclude-standard', '--full-name'].concat(ops),
    {
      cwd: context,
    }
  );
  if (stdout.trim()) {
    return stdout.split(/\r?\n/g);
  }
  return [];
};
