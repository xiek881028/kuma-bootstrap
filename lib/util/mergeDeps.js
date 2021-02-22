const semver = require('semver');
const { warn } = require('./logger');

const tryGetNewerRange = require('./tryGetNewerRange');

const extractSemver = r => r.replace(/^.+#semver:/, '');
const injectSemver = (r, v) =>
  semver.validRange(r) ? v : r.replace(/#semver:.+$/, `#semver:${v}`);

const isValidRange = range => {
  if (typeof range !== 'string') {
    return false;
  }

  const isValidSemver = !!semver.validRange(range);
  const isValidGitHub = range.match(/^[^/]+\/[^/]+/) != null;
  const isValidURI =
    range.match(
      /^(?:file|git|git\+ssh|git\+http|git\+https|git\+file|https?):/
    ) != null;

  return isValidSemver || isValidGitHub || isValidURI;
};

module.exports = function mergeDeps(
  generatorId,
  sourceDeps,
  depsToInject,
  sources,
  {
    prune,
    warnIncompatibleVersions
  }
) {
  const result = Object.assign({}, sourceDeps);

  for (const depName in depsToInject) {
    const sourceRange = sourceDeps[depName];
    const injectingRange = depsToInject[depName];

    // if they are the same, do nothing. Helps when non semver type deps are used
    if (sourceRange === injectingRange) continue;

    if (prune && injectingRange == null) {
      delete result[depName];
      continue;
    }

    if (!isValidRange(injectingRange)) {
      warn(
        `依赖版本范围无效 "${depName}":\n\n` +
        `- ${injectingRange} 由插件 "${generatorId}" 注入`
      );
      continue;
    }

    const sourceGeneratorId = sources[depName];
    if (!sourceRange) {
      result[depName] = injectingRange;
      sources[depName] = generatorId;
    } else {
      const sourceRangeSemver = extractSemver(sourceRange);
      const injectingRangeSemver = extractSemver(injectingRange);
      const r = tryGetNewerRange(sourceRangeSemver, injectingRangeSemver);
      const didGetNewer = !!r;

      // if failed to infer newer version, use existing one because it's likely
      // built-in
      result[depName] = didGetNewer
        ? injectSemver(injectingRange, r)
        : sourceRange;

      // if changed, update source
      if (result[depName] === injectingRange) {
        sources[depName] = generatorId;
      }

      // warn incompatible version requirements
      if (
        warnIncompatibleVersions &&
        (!semver.validRange(sourceRangeSemver) ||
          !semver.validRange(injectingRangeSemver) ||
          !semver.intersects(sourceRangeSemver, injectingRangeSemver))
      ) {
        warn(
          `项目依赖版本冲突 "${depName}":\n\n` +
          `- ${sourceRange} 由第插件 "${sourceGeneratorId}" 注入\n` +
          `- ${injectingRange} 由插件 "${generatorId}" 注入\n\n` +
          `使用 ${didGetNewer ? `较新的 ` : ``}版本 (${result[depName]
          }), 但这可能会导致构建错误。`
        );
      }
    }
  }
  return result;
}
