const fs = require('fs-extra');
const path = require('path');

function getPackageJson(projectPath) {
  const packagePath = path.join(projectPath, 'package.json');

  let packageJson;
  try {
    packageJson = fs.readFileSync(packagePath, 'utf-8');
  } catch (err) {
    throw new Error(`在 '${packagePath}' 不存在 package.json`);
  }

  try {
    packageJson = JSON.parse(packageJson);
  } catch (err) {
    throw new Error('package.json 格式错误');
  }

  return packageJson;
}

module.exports = function getPkg(context) {
  const pkg = getPackageJson(context);
  if (pkg.vuePlugins && pkg.vuePlugins.resolveFrom) {
    return getPackageJson(path.resolve(context, pkg.vuePlugins.resolveFrom));
  }
  return pkg;
};
