const fs = require('node:fs');
const path = require('node:path');

// safeStorage uses the operating system's credential protection. The journal
// includes the new ancestor and state so interrupted commits can be replayed.
function createSyncStore(directory, safeStorage) {
  const file = path.join(directory, 'sync.enc');
  const journal = path.join(directory, 'sync-commit.enc');
  const decode = target => JSON.parse(safeStorage.decryptString(fs.readFileSync(target)));
  function write(target, value) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统凭据保护不可用，暂时不能保存同步配对；离线日程不受影响');
    const temporary = target + '.tmp';
    fs.writeFileSync(temporary, safeStorage.encryptString(JSON.stringify(value)), { mode: 0o600 });
    fs.renameSync(temporary, target);
  }
  return {
    load: () => fs.existsSync(file) ? decode(file) : {},
    recover: () => fs.existsSync(journal) ? decode(journal) : null,
    checkpointLocalState(state) {
      // A failed sync-sidecar write can leave a replay journal while offline
      // editing continues. Keep that journal current before saving newer work.
      if (fs.existsSync(journal)) write(journal, { ...decode(journal), state });
    },
    commit(bundle, saveState) {
      write(journal, bundle);
      saveState(bundle.state);
      write(file, bundle.sync);
      fs.unlinkSync(journal);
    }
  };
}
module.exports = { createSyncStore };
