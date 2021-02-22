
const fs = require('fs');
// const ejs = require('ejs');
const path = require('path');
const deepmerge = require('deepmerge');
// const resolve = require('resolve');
// const { isBinaryFileSync } = require('isbinaryfile');
const mergeDeps = require('./mergeDeps');
// const { runTransformation } = require('vue-codemod');
const stringifyJS = require('./stringifyJS');
// const ConfigTransform = require('./ConfigTransform');
const semver = require('semver');
// const { error } = require('./logger');
// const { semver, error, getPluginLink, toShortPluginId, loadModule } = require('@vue/cli-shared-utils');

// const isString = val => typeof val === 'string';
const isFunction = val => typeof val === 'function';
const isObject = val => val && typeof val === 'object';
const mergeArrayWithDedupe = (a, b) => Array.from(new Set([...a, ...b]));
function pruneObject(obj) {
  if (typeof obj === 'object') {
    for (const k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) {
        continue;
      }

      if (obj[k] == null) {
        delete obj[k];
      } else {
        obj[k] = pruneObject(obj[k]);
      }
    }
  }

  return obj;
}

class GeneratorAPI {
  /**
   * @param {string} id - Id of the owner plugin
   * @param {Generator} generator - The invoking Generator instance
   * @param {object} options - generator options passed to this plugin
   * @param {object} rootOptions - root options (the entire preset)
   */
  constructor(id, generator, options, rootOptions) {
    this.id = id;
    this.generator = generator;
    this.options = options;
    this.rootOptions = rootOptions;

    /* eslint-disable no-shadow */
    // this.pluginsData = generator.plugins
    //   .map(({ id }) => ({
    //     name: toShortPluginId(id),
    //     link: getPluginLink(id)
    //   }));
    /* eslint-enable no-shadow */
  }

  /**
   * 渲染模板时解析数据。
   *
   * @private
   */
  // _resolveData(additionalData) {
  //   return Object.assign({
  //     options: this.options,
  //     rootOptions: this.rootOptions,
  //     plugins: this.pluginsData
  //   }, additionalData);
  // }

  /**
   * 注入文件处理中间件。
   *
   * @private
   * @param {FileMiddleware} middleware - A middleware function that receives the
   *   virtual files tree object, and an ejs render function. Can be async.
   */
  _injectFileMiddleware(middleware) {
    this.generator.fileMiddlewares.push(middleware);
  }

  /**
   * 将绝对路径、Windows样式的路径标准化为在this.files中用作索引的相对路径
   * @param {string} p the path to normalize
   */
  _normalizePath(p) {
    if (path.isAbsolute(p)) {
      p = path.relative(this.generator.context, p);
    }
    // The `files` tree always use `/` in its index.
    // So we need to normalize the path string in case the user passes a Windows path.
    return p.replace(/\\/g, '/');
  }

  /**
   * 解析项目的路径。
   *
   * @param {string} _paths - A sequence of relative paths or path segments
   * @return {string} The resolved absolute path, caculated based on the current project root.
   */
  resolve(..._paths) {
    return path.resolve(this.generator.context, ..._paths);
  }

  get cliVersion() {
    return require('../../package.json').version;
  }

  assertCliVersion(range) {
    if (typeof range === 'number') {
      if (!Number.isInteger(range)) {
        throw new Error('版本号只能为整数或字符串。')
      }
      range = `^${range}.0.0-0`
    }
    if (typeof range !== 'string') {
      throw new Error('版本号只能为整数或字符串。')
    }

    if (semver.satisfies(this.cliVersion, range, { includePrerelease: true })) return

    throw new Error(
      `需要全局 @kuma/cli 最低版本为 "${range}"， 但目前版本为 "${this.cliVersion}".`
    )
  }

  /**
   * 检查项目是否具有给定的插件。
   *
   * @param {string} id - Plugin id, can omit the (@vue/|vue-|@scope/vue)-cli-plugin- prefix
   * @param {string} version - Plugin version. Defaults to ''
   * @return {boolean}
   */
  hasPlugin(id, versionRange) {
    return this.generator.hasPlugin(id, versionRange);
  }

  /**
   * Configure how config files are extracted.
   *
   * @param {string} key - Config key in package.json
   * @param {object} options - Options
   * @param {object} options.file - File descriptor
   * Used to search for existing file.
   * Each key is a file type (possible values: ['js', 'json', 'yaml', 'lines']).
   * The value is a list of filenames.
   * Example:
   * {
   *   js: ['.eslintrc.js'],
   *   json: ['.eslintrc.json', '.eslintrc']
   * }
   * By default, the first filename will be used to create the config file.
   */
  // addConfigTransform(key, options) {
  //   const hasReserved = Object.keys(this.generator.reservedConfigTransforms).includes(key)
  //   if (
  //     hasReserved ||
  //     !options ||
  //     !options.file
  //   ) {
  //     if (hasReserved) {
  //       const { warn } = require('@vue/cli-shared-utils')
  //       warn(`Reserved config transform '${key}'`)
  //     }
  //     return
  //   }

  //   this.generator.configTransforms[key] = new ConfigTransform(options)
  // }

  /**
   * 扩展项目的package.json。
   * 还解决了插件之间的依赖冲突。
   * 在将文件写入磁盘之前，可以将工具配置字段提取到独立文件中。
   *
   * @param {object | () => object} fields - 要合并的字段
   * @param {object} [options] - 扩展/合并字段的选项
   * @param {boolean} [options.prune=false] - 合并后从对象中删除空或未定义的字段
   * @param {boolean} [options.merge=true] 深度嵌套字段，请注意，无论此选项如何，依赖项字段始终是深度合并的
   * @param {boolean} [options.warnIncompatibleVersions=true] 如果两个依赖版本范围不相交，则输出警告
   */
  extendPackage(fields, options = {}) {
    const extendOptions = {
      prune: false,
      merge: true,
      warnIncompatibleVersions: true
    };

    Object.assign(extendOptions, options);

    const pkg = this.generator.pkg;
    const toMerge = isFunction(fields) ? fields(pkg) : fields;
    for (const key in toMerge) {
      const value = toMerge[key];
      const existing = pkg[key];
      if (isObject(value) && (key === 'dependencies' || key === 'devDependencies')) {
        // use special version resolution merge
        pkg[key] = mergeDeps(
          this.id,
          existing || {},
          value,
          this.generator.depSources,
          extendOptions
        );
      } else if (!extendOptions.merge || !(key in pkg)) {
        pkg[key] = value;
      } else if (Array.isArray(value) && Array.isArray(existing)) {
        pkg[key] = mergeArrayWithDedupe(existing, value);
      } else if (isObject(value) && isObject(existing)) {
        pkg[key] = deepmerge(existing, value, { arrayMerge: mergeArrayWithDedupe });
      } else {
        pkg[key] = value;
      }
    }

    if (extendOptions.prune) {
      pruneObject(pkg);
    }
  }

  /**
   * Render template files into the virtual files tree object.
   *
   * @param {string | object | FileMiddleware} source -
   *   Can be one of:
   *   - relative path to a directory;
   *   - Object hash of { sourceTemplate: targetFile } mappings;
   *   - a custom file middleware function.
   * @param {object} [additionalData] - additional data available to templates.
   * @param {object} [ejsOptions] - options for ejs.
   */
  // render(source, additionalData = {}, ejsOptions = {}) {
  //   const baseDir = extractCallDir()
  //   if (isString(source)) {
  //     source = path.resolve(baseDir, source)
  //     this._injectFileMiddleware(async (files) => {
  //       const data = this._resolveData(additionalData)
  //       const globby = require('globby')
  //       const _files = await globby(['**/*'], { cwd: source, dot: true })
  //       for (const rawPath of _files) {
  //         const targetPath = rawPath.split('/').map(filename => {
  //           // dotfiles are ignored when published to npm, therefore in templates
  //           // we need to use underscore instead (e.g. "_gitignore")
  //           if (filename.charAt(0) === '_' && filename.charAt(1) !== '_') {
  //             return `.${filename.slice(1)}`
  //           }
  //           if (filename.charAt(0) === '_' && filename.charAt(1) === '_') {
  //             return `${filename.slice(1)}`
  //           }
  //           return filename
  //         }).join('/')
  //         const sourcePath = path.resolve(source, rawPath)
  //         const content = renderFile(sourcePath, data, ejsOptions)
  //         // only set file if it's not all whitespace, or is a Buffer (binary files)
  //         if (Buffer.isBuffer(content) || /[^\s]/.test(content)) {
  //           files[targetPath] = content
  //         }
  //       }
  //     })
  //   } else if (isObject(source)) {
  //     this._injectFileMiddleware(files => {
  //       const data = this._resolveData(additionalData)
  //       for (const targetPath in source) {
  //         const sourcePath = path.resolve(baseDir, source[targetPath])
  //         const content = renderFile(sourcePath, data, ejsOptions)
  //         if (Buffer.isBuffer(content) || content.trim()) {
  //           files[targetPath] = content
  //         }
  //       }
  //     })
  //   } else if (isFunction(source)) {
  //     this._injectFileMiddleware(source)
  //   }
  // }

  /**
   * 在应用了所有普通文件中间件之后，推送将应用的文件中间件。
   *
   * @param {FileMiddleware} cb
   */
  postProcessFiles(cb) {
    this.generator.postProcessFilesCbs.push(cb);
  }

  /**
   * 将文件写入磁盘后，推送一个回调以进行调用。
   *
   * @param {function} cb
   */
  onCreateComplete(cb) {
    this.afterInvoke(cb);
  }

  afterInvoke(cb) {
    this.generator.afterInvokeCbs.push(cb);
  }

  /**
   * 当文件已从未调用的插件写入磁盘时，推入要调用的回调
   *
   * @param {function} cb
   */
  afterAnyInvoke(cb) {
    this.generator.afterAnyInvokeCbs.push(cb);
  }

  /**
   * 添加生成器退出时要打印的消息（在任何其他标准消息之后）。
   *
   * @param {} msg String or value to print after the generation is completed
   * @param {('log'|'info'|'done'|'warn'|'error')} [type='log'] Type of message
   */
  exitLog(msg, type = 'log') {
    this.generator.exitLogs.push({ id: this.id, msg, type });
  }

  /**
   * 从json生成js配置文件的便捷方法
   */
  genJSConfig(value) {
    return `module.exports = ${stringifyJS(value, null, 2)}`;
  }

  /**
   * 将字符串表达式转换为可执行JS的JS配置。
   * @param {*} str JS expression as a string
   */
  makeJSOnlyValue(str) {
    const fn = () => { };
    fn.__expression = str;
    return fn;
  }

  // /**
  //  * 在脚本文件或.vue文件的脚本部分上运行codemod
  //  * @param {string} file the path to the file to transform
  //  * @param {Codemod} codemod the codemod module to run
  //  * @param {object} options additional options for the codemod
  //  */
  // transformScript(file, codemod, options) {
  //   const normalizedPath = this._normalizePath(file);

  //   this._injectFileMiddleware(files => {
  //     if (typeof files[normalizedPath] === 'undefined') {
  //       error(`没有找到文件 ${normalizedPath}`);
  //       return;
  //     }

  //     files[normalizedPath] = runTransformation(
  //       {
  //         path: this.resolve(normalizedPath),
  //         source: files[normalizedPath]
  //       },
  //       codemod,
  //       options
  //     );
  //   });
  // }

  /**
   * 将导入语句添加到文件。待评估~~~~~~~~~~~~~~~~~
   */
  injectImports(file, imports) {
    const _imports = (
      this.generator.imports[file] ||
      (this.generator.imports[file] = new Set())
    );
    (Array.isArray(imports) ? imports : [imports]).forEach(imp => {
      _imports.add(imp);
    });
  }

  /**
   * Add options to the root Vue instance (detected by `new Vue`).
   * 可以改造成在app.js入口注入中间件，待评估~~~~~~~~~~~~~~~~
   */
  // injectRootOptions(file, options) {
  //   const _options = (
  //     this.generator.rootOptions[file] ||
  //     (this.generator.rootOptions[file] = new Set())
  //   )
  //     ; (Array.isArray(options) ? options : [options]).forEach(opt => {
  //       _options.add(opt)
  //     })
  // }

  /**
   * 插件被调用了吗？
   *
   * @readonly
   */
  get invoking() {
    return this.generator.invoking;
  }
}

// function extractCallDir() {
//   // extract api.render() callsite file location using error stack
//   const obj = {}
//   Error.captureStackTrace(obj)
//   const callSite = obj.stack.split('\n')[3]

//   // the regexp for the stack when called inside a named function
//   const namedStackRegExp = /\s\((.*):\d+:\d+\)$/
//   // the regexp for the stack when called inside an anonymous
//   const anonymousStackRegExp = /at (.*):\d+:\d+$/

//   let matchResult = callSite.match(namedStackRegExp)
//   if (!matchResult) {
//     matchResult = callSite.match(anonymousStackRegExp)
//   }

//   const fileName = matchResult[1]
//   return path.dirname(fileName)
// }

// const replaceBlockRE = /<%# REPLACE %>([^]*?)<%# END_REPLACE %>/g

// function renderFile(name, data, ejsOptions) {
//   if (isBinaryFileSync(name)) {
//     return fs.readFileSync(name) // return buffer
//   }
//   const template = fs.readFileSync(name, 'utf-8')

//   // custom template inheritance via yaml front matter.
//   // ---
//   // extend: 'source-file'
//   // replace: !!js/regexp /some-regex/
//   // OR
//   // replace:
//   //   - !!js/regexp /foo/
//   //   - !!js/regexp /bar/
//   // ---
//   const yaml = require('yaml-front-matter')
//   const parsed = yaml.loadFront(template)
//   const content = parsed.__content
//   let finalTemplate = content.trim() + `\n`

//   if (parsed.when) {
//     finalTemplate = (
//       `<%_ if (${parsed.when}) { _%>` +
//       finalTemplate +
//       `<%_ } _%>`
//     )

//     // use ejs.render to test the conditional expression
//     // if evaluated to falsy value, return early to avoid extra cost for extend expression
//     const result = ejs.render(finalTemplate, data, ejsOptions)
//     if (!result) {
//       return ''
//     }
//   }

//   if (parsed.extend) {
//     const extendPath = path.isAbsolute(parsed.extend)
//       ? parsed.extend
//       : resolve.sync(parsed.extend, { basedir: path.dirname(name) })
//     finalTemplate = fs.readFileSync(extendPath, 'utf-8')
//     if (parsed.replace) {
//       if (Array.isArray(parsed.replace)) {
//         const replaceMatch = content.match(replaceBlockRE)
//         if (replaceMatch) {
//           const replaces = replaceMatch.map(m => {
//             return m.replace(replaceBlockRE, '$1').trim()
//           })
//           parsed.replace.forEach((r, i) => {
//             finalTemplate = finalTemplate.replace(r, replaces[i])
//           })
//         }
//       } else {
//         finalTemplate = finalTemplate.replace(parsed.replace, content.trim())
//       }
//     }
//   }

//   return ejs.render(finalTemplate, data, ejsOptions)
// }

module.exports = GeneratorAPI