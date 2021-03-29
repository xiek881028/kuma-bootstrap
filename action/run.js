/**
 * @file run命令基础模板
 * @author xiek(285985285@qq.com)
 */

const Run = require('../baseCls/Run');

module.exports = {
  command: 'run <app-name> -- [args...]',
  description: '运行插件命令',
  allowUnknownOption: true,
  class: Run,
};
