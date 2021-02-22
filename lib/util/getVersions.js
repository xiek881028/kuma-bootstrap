const packageJson = require('package-json');
let sessionCached;

module.exports = async function getVersions() {
  if (sessionCached) {
    return sessionCached;
  }

  let latest;
  let error;
  const local = require(`../../package.json`).version;
  if (process.env.KUMA_TEST) {
    return (sessionCached = {
      current: local,
      latest: local
    })
  }

  try {//~~~~~~~~~~~~~~~~~~~~~~
    let pkg = await packageJson('react', {
      // allVersions: true,
    });
    latest = pkg.version;
  } catch (err) {
    latest = '0.0.0';
    error = true;
  }

  return {
    current: local,
    latest,
    error,
  };
}
