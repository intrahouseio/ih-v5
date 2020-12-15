const https = require('https');
const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const { networkInterfaces } = require('os');


const store = {
  paths: {
    root: '/opt/intrahouse-d',
  },
  deps: [
    { name: 'zip', check: 'zip -L', install: 'sudo apt-get install -y zip' },
    { name: 'unzip', check: 'unzip', install: 'sudo apt-get install -y unzip'  },
    { name: 'rsync', check: 'rsync --version', install: 'sudo apt-get install -y rsync'  },
  ],
  res_deps: [],
  bar: ['|', '/', '–', '\\'.slice(0)],
  progress: 0,
}



function json(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }}, (res) => {
      let rawData = '';
      res.on('data', chunk => rawData += chunk.toString());
      res.on('end', () => resolve(JSON.parse(rawData)));
    }).on('error', reject);
  });
}

function file(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }}, (res) => {
      let rawData = [];
      res.on('data', chunk => rawData.push(chunk));
      res.on('end', () => {
        if (res.headers.location) {
          file(res.headers.location)
          .then(data => resolve(data));
        } else {
          resolve(Buffer.concat(rawData));
        }
      });
    }).on('error', reject);
  });
}

function getAssetByName(release, name) {
  if (release.assets !== undefined) {
    return release.assets.find(i => i.name === name) || null;
  }
  return null;
}

async function getLatestVesion() {
  const latest = await json('https://api.github.com/repos/intrahouseio/ih-v5/releases/latest');
  const asset = getAssetByName(latest, 'ih-systems.zip');

  if (asset) {
    const version = latest.tag_name;
    const url = asset.browser_download_url;
    return { version, url }
  }
  return null;
}

function print_table(items) {
  items.forEach(i => {
    console.log('\x1b[34m  ' + i.name.padEnd(25, ' ') + (i.status ? '\x1b[32m ok' : '\x1b[35m will be installed'));
  })
  console.log('\x1b[0m');
}


function exec(text) {
  return new Promise((resolve, reject) => {
    child_process.exec(text, (error, stdout, stderr) => {
      if (error) {
        resolve({ fail: error })
      }
      resolve({ out: stdout, err: stderr })
    });
  });
}

function checkdep(item) {
  return new Promise((resolve, reject) => {
    exec(item.check)
      .then(res => {
        if (res.fail) {
          resolve({ ...item, status: false })
        } else {
          resolve({ ...item, status: true })
        }
      });
  });
}

function installdep(item) {
  store.progress = 0;
  const bar = setInterval(() => progress_bar(item.name, null), 125);
  return new Promise((resolve, reject) => {
    exec(item.install)
    .then(res => {
      clearInterval(bar);
      progress_bar(item.name, res.fail ? '\x1b[31m error' : '\x1b[32m ok')
      resolve();
    });
  });
}

function checkService() {
  return new Promise((resolve, reject) => {
    exec('ps aux')
    .then(res => {
      if (res.fail) {
        resolve(null)
      } else {
        if (res.out.indexOf('intrahouse-d') === -1) {
          resolve(null)
        } else {
          resolve(true)
        }
      }
    })
  });
}

function progress_bar(name, status) {

  process.stdout.clearLine();
  process.stdout.cursorTo(0);

  const indicator = status ? status : '\x1b[39m' + store.bar[store.progress]

  process.stdout.write('\x1b[34m  ' + name.padEnd(25, ' ') + indicator)
  
  if (store.progress === 3) {
    store.progress = 0;
  }
  store.progress++;
}

function splitPath(p) {
  return p ? p.split(path.delimiter) : [];
}

function statFollowLinks() {
  return fs.statSync.apply(fs, arguments);
}

function checkPath(pathName) {
  return fs.existsSync(pathName) && !statFollowLinks(pathName).isDirectory();
}

async function detectInitSystem() {
    let system = null;

    const hash_map = {
      'systemctl'  : 'systemd',
      'update-rc.d': 'upstart',
      'chkconfig'  : 'systemv',
      'rc-update'  : 'openrc',
      'launchctl'  : 'launchd',
      'sysrc'      : 'rcd',
      'rcctl'      : 'rcd-openbsd',
      'svcadm'     : 'smf'
    };
    
    const initArray = Object.keys(hash_map);
    const pathArray = splitPath(process.env.PATH);

    for (const init of initArray) {
      for (const p of pathArray) {
        const attempt = path.resolve(p, init);
        const check = checkPath(attempt);
   
        if (system === null && check) {
          system = hash_map[init]
        }
      }
    }
    return system;
}


async function checkDependencies() {
  console.log('\x1b[33mCheck dependencies:\n')
  store.res_deps = await Promise.all(store.deps.map(i => checkdep(i)));
  print_table(store.res_deps);

  return Promise.resolve();
}

async function installDependencies() {
  const list = store.res_deps.filter(i => i.status === false);
  if (list.length > 0) {
    console.log('\x1b[33mInstalling dependencies:');
    for (const item of list) {
      console.log('')
      await installdep(item);
    }
    console.log('\x1b[0m');
  }
  return Promise.resolve();
}

async function installCore() {
  console.log('\x1b[33mInstall core: \n')

  const bar1 = setInterval(() => progress_bar('found version', null), 125);
  const latest = await getLatestVesion();
  // const latest = {version: 'v5.0.0', url: 'https://github.com/intrahouseio/ih-v5/releases/download/v5.0.0/ih-systems.zip' };
  clearInterval(bar1);
  progress_bar('found version', '\x1b[35m' + latest.version)
  
  console.log('\x1b[0m');
  console.log('\x1b[0m');

  const bar2 = setInterval(() => progress_bar('downloading core', null), 125);
  const buf = await file(latest.url);
 
  fs.writeFileSync(`${store.paths.root}/core.zip`, buf);

  clearInterval(bar2);
  progress_bar('downloading core', '\x1b[32m' + 'ok')

  console.log('')

  const bar3 = setInterval(() => progress_bar('extract core', null), 125);
  const res = await exec(`unzip -o ${store.paths.root}/core.zip -d ${store.paths.root}`)
  clearInterval(bar3);
  progress_bar('extract core', res.fail ? '\x1b[31merror' : '\x1b[32mok')

  console.log('\x1b[0m');
  console.log('\x1b[0m');

  const bar4 = setInterval(() => progress_bar('downloading dependents', null), 125);
  const buf2 = await file('https://github.com/intrahouseio/ih-v5/releases/download/v0.0.0/node_modules.zip');
 
  fs.writeFileSync(`${store.paths.root}/node_modules.zip`, buf2);

  clearInterval(bar4);
  progress_bar('downloading dependents', '\x1b[32m' + 'ok')

  console.log('')

  const bar5 = setInterval(() => progress_bar('extract dependents', null), 125);
  const res2 = await exec(`unzip -o ${store.paths.root}/node_modules.zip -d ${store.paths.root}/backend`)
  clearInterval(bar5);
  progress_bar('extract dependents', res2.fail ? '\x1b[31merror' : '\x1b[32mok')

  console.log('\x1b[0m');
  console.log('\x1b[0m');

  const bar6 = setInterval(() => progress_bar('create config', null), 125);
  fs.writeFileSync(`${store.paths.root}/config.json`, JSON.stringify({
    project: 'testproject',
    name_service: 'intrahouse-d',
    lang: 'ru',
    port: 3000,
  }, 'utf8'));
  clearInterval(bar6);
  progress_bar('create config', '\x1b[32m' + 'ok')

  console.log('\x1b[0m');
  console.log('\x1b[0m');
  return Promise.resolve();
}

async function registerServiceLinux() {
  console.log('\x1b[33mRegister service:');
  console.log('\x1b[0m');

  const initSystem = await detectInitSystem();

  if (initSystem) {
    console.log('\x1b[34m  ' + 'init system detected'.padEnd(25, ' ') + '\x1b[35m ' + initSystem)
    const tools = require('/opt/intrahouse-d/backend/node_modules/ih-systems/tools');
    const template = tools.getTemplate(initSystem);
    if (template) {
      if (initSystem === 'systemd') {
        const destination = '/etc/systemd/system/intrahouse-d.service';
        fs.writeFileSync(destination, template);
        await exec('systemctl enable intrahouse-d')
        await exec('service intrahouse-d restart')
        console.log('\x1b[34m  ' + 'init config file'.padEnd(25, ' ') + '\x1b[32m ok')
      }
      if (initSystem === 'launchd') {
        const destination = path.join(process.env.HOME, 'Library/LaunchAgents/intrahouse-d.plist');
        fs.writeFileSync(destination, template);
        await exec(`launchctl load -w ${destination}`)
        await exec(`launchctl start intrahouse-d`)
        console.log('\x1b[34m  ' + 'init config file'.padEnd(25, ' ') + '\x1b[32m ok')
      }
      console.log('')
      const bar1 = setInterval(() => progress_bar('service', null), 125);
      const service = await checkService();
      clearInterval(bar1);
      progress_bar('service', service ? '\x1b[36m [active]' : '\x1b[31m [not found]')
    } else {
      console.log('\x1b[34m  ' + 'config file'.padEnd(25, ' ') + '\x1b[31m [not supported]')
    }
  } else {
    console.log('\x1b[31m  init system is not supported!')
  }
  return Promise.resolve();
}

function info() {
  console.log('\x1b[0m');
  console.log('\x1b[0m');
  console.log('\x1b[0m');
  console.log('\x1b[34m-----------------------------------------------------------------------------------')
  

  const nets = networkInterfaces();

  const ips = Object
    .keys(nets)
    .reduce((p, c) => p.concat(nets[c]), [])
    .filter(i => i.internal === false && i.family === 'IPv4')
    .map(i => `http://${i.address}:8088/admin`)
    .join(', ');

  console.log('\x1b[0m');
  console.log(`\x1b[34m Login:\x1b[35m admin`);
  console.log(`\x1b[34m Password:\x1b[35m 202020`);
  console.log(`\x1b[34m Web interface:\x1b[35m ${ips}`);
  console.log('\x1b[0m');
  console.log('\x1b[34m Complete! Thank you.');
  console.log('\x1b[0m');

  return Promise.resolve();
}


async function main() {
  await checkDependencies();
  await installDependencies();
  await installCore();
  await registerServiceLinux();
  await info();

  console.log('\x1b[0m');
}

main()