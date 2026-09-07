const handler = {
  get(target, prop) {
    if (prop === '__isStub') return true;
    if (prop === 'then' || prop === 'catch') return undefined;
    return (...args) => Promise.resolve(null);
  },
  apply() { return Promise.resolve(null); },
  construct() { return new Proxy({}, handler); }
};
module.exports = new Proxy(function() {}, handler);
