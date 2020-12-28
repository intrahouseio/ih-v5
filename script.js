const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const http = require('http');
const https = require('https');
const child_process = require('child_process');
const { networkInterfaces } = require('os');

const COLOR_CLEAR = '\x1b[0m';
const COLOR_TITLE = '\x1b[33m';
const COLOR_ROW   = '\x1b[34m';

const COLOR_OK    = '\x1b[32m';
const COLOR_ERROR = '\x1b[31m';
const COLOR_INFO  = '\x1b[35m';

const BAR_ASSETS =  ['|', '/', '–', '\\'.slice(0)];
 

const options = {
  project_name: `demo_${Date.now()}`,
  port: 8088,
  binary_url: 'https://github.com/intrahouseio/ih-v5/releases/download/v0.0.0',
  asset_url: 'https://api.github.com/repos/intrahouseio/ih-v5/releases/latest',
  files_url: 'https://github.com/intrahouseio/ih-v5/raw/main',
  plugins_url: 'https://github.com/intrahouseio',
  asset_name: 'ih-systems.zip',
  service_name: 'ih-v5',
  install_path: '/opt/ih-v5',
  data_path: '/var/lib/ih-v5', 
  install_deps: [
    { 
      name: 'zip', 
      check: { 
        linux: 'zip -L',
      }, 
      install: { 
        linux: 'sudo apt-get install -y zip',
      },
    },
    { 
      name: 'unzip', 
      check: { 
        linux: 'unzip',
      },
      install: { 
        linux: 'sudo apt-get install -y unzip',
      },  
    },
    { 
      name: 'rsync', 
      check: { 
        linux: 'rsync --version',
      },
      install: { 
        linux: 'sudo apt-get install -y rsync',
      },
    },
  ],
  install_plugins: [
    { 
      name: 'emulator',
      id: 'emuls',
      destination: 'intraHouse.plugin-Sensors-Emulator',
    }
  ],
  install_agents: [
    {
      name: 'influxDB',
      id: 'influx',
      destination: 'ih-dbagent-influx',
    }
  ]
}

function get_config() {
  return JSON.stringify({
    project: options.project_name,
    name_service: options.service_name,
    lang: 'ru',
    port: options.port,
  }, null, 2)
}

function get_template_service(type) {
  if (type === 'systemd') {
    return {
      destination: `/etc/systemd/system/${options.service_name}.service`,
      commands: [
        `systemctl enable ${options.service_name}`,
        `service ${options.service_name} restart`,
      ],
      template: `
      [Unit]
      Description=${options.service_name}
      After=network.target mysql.service
  
      [Service]
      WorkingDirectory=${options.install_path}
      Environment=PATH=${options.install_path}/node/bin:/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
      Restart=always
  
      ExecStart=${options.install_path}/node/bin/node ${options.install_path}/backend/app.js prod
  
      StandardOutput=syslog
      StandardError=syslog
      SyslogIdentifier=${options.service_name}
  
      [Install]
      WantedBy=multi-user.target
      `
    };
  }

  if (type === 'upstart') {
    return {
      destination: `/etc/init/${options.service_name}.conf`,
      commands: [
        'initctl reload-configuration',
        `initctl stop ${options.service_name}`,
        `initctl start ${options.service_name}`,
      ],
      template: `
      description "${options.service_name}"
  
      start on (filesystem and net-device-up IFACE!=lo)
      stop on runlevel [!2345]
  
      chdir ${options.install_path}
  
      env DAEMON="${options.install_path}/node/bin/node ${options.install_path}/backend/app.js prod"
      env PATH=${options.install_path}/node/bin:$PATH
  
      respawn
      respawn limit unlimited
  
      exec $DAEMON
      `
    };
  }

  if (type === 'launchd') {
    return {
      destination: path.join(process.env.HOME, `Library/LaunchAgents/${options.service_name}.plist`),
      commands: [
        `launchctl load -w ${path.join(process.env.HOME, `Library/LaunchAgents/${options.service_name}.plist`)}`,
        `launchctl stop ${options.service_name}`,
        `launchctl start ${options.service_name}`,
      ],
      template: `
      <?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
      <plist version="1.0">
        <dict>
          <key>Label</key>
            <string>${options.service_name}</string>
          <key>KeepAlive</key>
            <true/>
          <key>ProgramArguments</key>
            <array>
              <string>${options.install_path}/node/bin/node</string>
              <string>${options.install_path}/backend/app.js</string>
              <string>prod</string>
            </array>
          <key>RunAtLoad</key>
            <true/>
          <key>OnDemand</key>
            <false/>
          <key>WorkingDirectory</key>
            <string>${options.install_path}</string>
          <key>EnvironmentVariables</key>
          <dict>
            <key>PATH</key>
              <string>${options.install_path}/node/bin</string>
          </dict>
          <key>StandardOutPath</key>
            <string>${options.install_path}/launchdOutput.log</string>
          <key>StandardErrorPath</key>
            <string>${options.install_path}/launchdErrors.log</string>
        </dict>
      </plist>
      `
    };
  }

  return null;
}

//-------------------------------------------------------

function abort(msg) {
  console.log(COLOR_ERROR)
  console.log('-----------------Installation Aborted-----------------')
  console.log('');
  console.log(msg)
  console.log('------------------------------------------------------')
  console.log(COLOR_CLEAR)
  console.log(COLOR_INFO + 'Please visit https://github.com/intrahouseio/ih-v5/issues\nto approve this error or send to email support@ih-systems.com')
  console.log(COLOR_CLEAR)
  console.log(COLOR_CLEAR)
  process.exit(1);
}

function dir(src, dest) {
  return new Promise((resolve, reject) => {
    try {
      if (fs.existsSync(src)) {
        const stats = fs.statSync(src);
        if (stats.isDirectory()) {
          fs.mkdirSync(dest, { recursive: true });
          fs.readdirSync(src).forEach(childItemName => {
            dir(path.join(src, childItemName), path.join(dest, childItemName));
          });
        } else {
          fs.copyFileSync(src, dest);
        }
      }
      resolve();
    } catch(e) {
      reject(e)
    }
  })
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

function git(id, name, _path) {
  return new Promise((resolve, reject) => {
    const _pathz = `${options.install_path}/temp/${id}.zip`;
    json(`https://api.github.com/repos/intrahouseio/${name}/releases/latest`)
      .then(res => {
        if (res.zipball_url) {
          file(res.zipball_url, _pathz)
            .then(() => {
              exec(`unzip -o ${_pathz} -d ${options.install_path}/temp/${id}`)
                .then(() => {
                  fs.readdir(`${options.install_path}/temp/${id}`, (err, files) => {
                    if (err) {
                      reject(err)
                    } else {
                      if (files.length === 1) {
                        dir(`${options.install_path}/temp/${id}/${files[0]}`, `${_path}/${id}`)
                          .then(resolve)
                          .catch(reject);
                      } else {
                        reject('unzip folder empty or many files!')
                      }
                    }
                  });
                })
                .catch(reject);
            })
            .catch(reject)
        } else {
          reject('latest release not found!')
        }
      })
      .catch(reject)
  });
}

function file(url, _path) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }}, (res) => {
      let rawData = [];
      res.on('data', chunk => rawData.push(chunk));
      res.on('end', () => {
        if (res.headers.location) {
          file(res.headers.location, _path)
            .then(resolve)
            .catch(reject)
        } else {
          if (_path) {
            fsp.writeFile(_path, Buffer.concat(rawData))
            .then(resolve)
            .catch(reject)
          } else {
            resolve(Buffer.concat(rawData));
          }
        }
      });
    }).on('error', reject);
  });
}

function exec(cmd) {
  return new Promise(async (resolve, reject) => {
    if (Array.isArray(cmd)) {
      for (const i of cmd) {
        try {
          await exec(i);
        } catch (e) {
          // abort(e);
        }
      }
      resolve(true);
    } else {
      child_process.exec(cmd, (error, stdout, stderr) => {
        if (error) {
          reject(error.message)
        } else {
          resolve(stdout)
        }
      });
    }
  });
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

async function detect_init_system() {
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

function getAssetByName(release, name) {
  if (release.assets !== undefined) {
    return release.assets.find(i => i.name === name) || null;
  }
  return null;
}

function progress_bar_start(title) {
  if (options.__bar_active) {
    clearInterval(options.__bar_timer);
  }

  options.__bar_active = true;
  options.__bar_tick = 0;
  options.__bar_name = title;
  options.__bar_timer = setInterval(print_bar, 125);
}

function progress_bar_stop(text = 'ok', color = COLOR_OK, ext = null) {
  if (options.__bar_active) {
    options.__bar_active = null;

    clearInterval(options.__bar_timer);

    process.stdout.clearLine();
    process.stdout.cursorTo(0);

    print_row(options.__bar_name, true, text, '', color, COLOR_CLEAR, 2, ext)
    print_row('', true, '\n', '\n', COLOR_CLEAR, COLOR_CLEAR, 2)

    options.__bar_timer = null;
    options.__bar_tick = null;
    options.__bar_name = null;
  }
}

function print_bar() {
  process.stdout.clearLine();
  process.stdout.cursorTo(0);

  print_row(options.__bar_name, true, BAR_ASSETS[options.__bar_tick], '', COLOR_CLEAR, COLOR_ERROR, 2)
  
  options.__bar_tick++;

  if (options.__bar_tick === 4) {
    options.__bar_tick = 0;
  }
  
}

function print_title(text) {
  console.log(`\n${COLOR_TITLE}${text}:${COLOR_CLEAR}\n`);
}

function print_row(text, status = true, good_mes, err_mes, color_ok = COLOR_OK, color_err = COLOR_INFO, type = 1, legend) {
  const txt = text.padEnd(25, ' ');
  const res = status ? color_ok + good_mes : color_err + err_mes;
  const leg = legend ? ` -->  ${legend.split('\n')[0]}...` : '';

  if (type === 1) {
    console.log(`${COLOR_ROW}  ${txt} ${res}${COLOR_CLEAR} ${leg}`);
  } else {
    process.stdout.write(`${COLOR_ROW}  ${txt} ${res}${COLOR_CLEAR} ${leg}`)
  }
}

function check_dep(item) {
  return new Promise((resolve, reject) => {
    exec(item.check.linux)
      .then(out => resolve({ status: true, mes: out }))
      .catch(err => resolve({ status: false, mes: err }));
  });
}

function cmd(name, promise, auto = true, isAbort = true) {
  return new Promise((resolve, reject) => {
    progress_bar_start(name)

    promise
      .then(res => {
        if (auto) {
          progress_bar_stop('ok', COLOR_OK);
        }
        resolve(res);
      })
      .catch(e => {
        progress_bar_stop('error', COLOR_ERROR);
        if (isAbort) {
          abort(e.message ? e.message : e);
        } else {
          resolve(e.message ? e.message : e);
        }
      })
  });
}


function check_service() {
  return new Promise((resolve, reject) => {
    exec('ps aux')
    .then(res => {
      if (res.indexOf(options.service_name) === -1) {
        reject('service process not found!')
      } else {
        resolve(true)
      }
    })
    .catch(() => reject('service not found!'))
  });
}

function check_port(isExist = false) {
  return new Promise((resolve, reject) => {
    let i = 0

    function check() {
      i++;
      if (i > 5) {
        reject('service port not found!')
      } else {
        setTimeout(() => req(), 1700)
      }
    }

    function callback(res) {
      if (isExist) {
        reject('port busy!');
      } else {
        if (res.statusCode === 200) {
          resolve(true)
        } else {
          check();
        }
      }
    }

    function error() {
      if (isExist) {
        resolve(true)
      } else {
        check();
      }
    }

    function req() {
      http
      .get(`http://127.0.0.1:${options.port}/admin/`, { headers: { 'User-Agent': 'Mozilla/5.0' }}, callback)
      .on('error', error);
    }

    req();
  })

}

function get_port() {
  return new Promise((resolve, reject) => {
    function check() {
      check_port(true)
      .then(resolve)
      .catch(() => {
        options.port = options.port + 1;
        check();
      })
    }
    check();
  });
}


//-------------------------------------------------------

async function cleanup() {
  exec(`service ${options.service_name} stop`)
    .then(() => {})
    .catch(() => {});
  exec(`initctl stop ${options.service_name}`)
    .then(() => {})
    .catch(() => {});
  exec(`launchctl stop ${options.service_name}`)
    .then(() => {})
    .catch(() => {});
}

async function check_dependencies() {
  print_title('Check dependencies');
  
  const check_list = await Promise.all(options.install_deps.map(check_dep));

  options.install_deps = options.install_deps.map((i, key) => {
    return { 
      ...i, 
      check_status: check_list[key].status,
      check_mes: check_list[key].mes, 
    };
  })

  options.install_deps.forEach(i => {
    print_row(i.name, i.check_status, 'ok', '[will be installed]')
  });
}

async function install_dependencies() {
  const install_list = options.install_deps.filter(i => i.check_status === false);

  if (install_list.length) {
    print_title('Installing dependencies');

    for (const i of install_list) {
      await cmd(i.name, exec(i.install.linux))
    }
  }
}

async function install_core() {
  print_title('Install core');

  const res = await cmd('found version', json(options.asset_url), false);
  const asset = getAssetByName(res, options.asset_name);
  
  if (!(asset && asset.browser_download_url)) {
    abort('Version not found: ' + options.asset_url + ' | ' + options.asset_name); 
  }
  progress_bar_stop(res.tag_name, COLOR_INFO);

  console.log('');

  await cmd('downloading core', file(asset.browser_download_url, `${options.install_path}/temp/core.zip`));
  await cmd('extract core', exec(`unzip -o ${options.install_path}/temp/core.zip -d ${options.install_path}`));

  console.log('');

  await cmd('downloading dependencies', file(`${options.binary_url}/node_modules.zip`, `${options.install_path}/temp/deps.zip`));
  await cmd('extract dependencies', exec(`unzip -o ${options.install_path}/temp/deps.zip -d ${options.install_path}/backend`));

  console.log('');
 
  await cmd('downloading project', file(`${options.files_url}/projects/smarthome5.ihpack`, `${options.install_path}/temp/project.zip`));
  await cmd('extract project', exec(`unzip -o ${options.install_path}/temp/project.zip -d ${options.install_path}/temp/project`));
  await cmd('copy project', dir(`${options.install_path}/temp/project`, `${options.data_path}/projects/${options.project_name}`));

  console.log('');

  await get_port();
  await cmd('create config', fsp.writeFile(`${options.install_path}/config.json`, get_config(),'utf8'));
}

async function install_plugins () {
  print_title('Install plugins');
  
  fs.mkdirSync(`${options.data_path}/plugins`, { recursive: true });

  let q = 0;
  
  for (const i of options.install_plugins) {
    if (q !== 0) {
      console.log('');
    }
    await cmd(`deploy ${i.name}`, git(i.id, i.destination, `${options.data_path}/plugins`), true, false);
    q++
  }
}

async function install_agents () {
  print_title('Install agents');
  fs.mkdirSync(`${options.data_path}/agents`, { recursive: true });

  let q = 0;
  
  for (const i of options.install_agents) {
    if (q !== 0) {
      console.log('');
    }
    await cmd(`deploy ${i.name}`, git(i.id, i.destination, `${options.data_path}/agents`), true, false);
    q++
  }
}

async function register_service() {
  print_title('Register service');

  const init_system = await detect_init_system();
  const service = get_template_service(init_system);

  print_row('init system detected', service, init_system, '[not supported]', COLOR_INFO, COLOR_ERROR)

  if (service) {
    console.log('');

    await cmd('service config file', fsp.writeFile(service.destination, service.template, 'utf8'));
    await cmd('service activation', exec(service.commands));

    console.log('');

    await cmd('check service', check_service(), true, false);
    await cmd('check port', check_port(), true, false);

  } else {
    abort(`This platform does not support init systems ${process.platform}/${process.arch}`)
  }
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
    .map(i => `http://${i.address}:${options.port}/admin`)
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
  await cleanup();
  await check_dependencies();
  await install_dependencies();
  await install_core();
  await install_plugins();
  await install_agents();
  await register_service();
  await info();
}

main()