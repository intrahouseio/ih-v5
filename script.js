const fs = require('fs');
const path = require('path');
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
  service_name: 'ih-v5',
  install_path: '/opt/ih-v5',
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
  ]
}

function exec(cmd) {
  return new Promise((resolve, reject) => {
    child_process.exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error.message)
      } else {
        resolve(stdout)
      }
    });
  });
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

function cmd(name, promise) {
  return new Promise((resolve, reject) => {
    progress_bar_start(name)

    promise
      .then(res => {
        progress_bar_stop('ok', COLOR_OK);
        resolve(res);
      })
      .catch(e => {
        progress_bar_stop('error', COLOR_ERROR);
        console.log(COLOR_ERROR)
        console.log('-----------------Installation Aborted-----------------')
        console.log('');
        console.log(e)
        console.log('------------------------------------------------------')
        console.log(COLOR_CLEAR)
        console.log(COLOR_INFO + 'Please visit https://github.com/intrahouseio/ih-v5/issues\nto approve this error or send to email support@ih-systems.com')
        console.log(COLOR_CLEAR)
        console.log(COLOR_CLEAR)
        process.exit(1);
      })
  });
}


//-------------------------------------------------------


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

}


async function main() {
  await check_dependencies();
  await install_dependencies();
  await install_core();

  console.log('\n main');
}

main()