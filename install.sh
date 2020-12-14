
#!/bin/bash


echo -e "\033[0;31m"

#-------------- functions
function config {
   pwd=$(pwd)
   name_service="intrahouse-d"
   root="/opt/$name_service"
   url="https://github.com/intrahouseio/ih-v5/releases/download/v0.0.0"
}

function clear {
  rm -fr $root
  mkdir -p $root
  cd $root
  mkdir -p node
}

function logo {
echo -e "\033[0;34m"
cat <<\EOF
   ██╗██╗  ██╗      ███████╗██╗   ██╗███████╗████████╗███████╗███╗   ███╗███████╗
   ██║██║  ██║      ██╔════╝╚██╗ ██╔╝██╔════╝╚══██╔══╝██╔════╝████╗ ████║██╔════╝
   ██║███████║█████╗███████╗ ╚████╔╝ ███████╗   ██║   █████╗  ██╔████╔██║███████╗
   ██║██╔══██║╚════╝╚════██║  ╚██╔╝  ╚════██║   ██║   ██╔══╝  ██║╚██╔╝██║╚════██║
   ██║██║  ██║      ███████║   ██║   ███████║   ██║   ███████╗██║ ╚═╝ ██║███████║
   ╚═╝╚═╝  ╚═╝      ╚══════╝   ╚═╝   ╚══════╝   ╚═╝   ╚══════╝╚═╝     ╚═╝╚══════╝
                                                                                                                                    
                         Software for Automation Systems                          
-----------------------------------------------------------------------------------
EOF
echo -e "\033[0;31m"
}

function install {
 # echo -e "\033[0;33m"
 # echo -e "INSTALL:\033[0;34m"
  echo -e "\033[0m"
  sudo sudo "$root/node/bin/node" "$root/script.js"

}

function files {
  echo -e "\033[0;33m"
  echo -e "Get loader:\033[0;34m"

  if [ ! -f "$pwd/script.js" ]; then
      curl -Lo node.tar.gz "$url/node-$platform-$arch.tar.gz"  #script not found
    else
      curl -Lo node.tar.gz "$url/node-$platform-$arch.tar.gz" #script found
      cp "$pwd/script.js" "$root/script.js"
  fi
  
  echo -e "\033[0;33m"
  echo -e "Extract loader:\033[0;34m"
  echo ""

  while true;do echo -n .;sleep 1;done &
  cd ./node
  tar xf ./../node.tar.gz --strip 1 
  cd ./../
  kill $!; trap 'kill $!' SIGTERM
  echo "ok"
}

function run {
  config
  clear
  logo
  files
  # cp "$pwd/script.js" "$root/script.js"
  install
}


#-------------- check sudo

if [ "$EUID" -ne 0 ]
  then echo "Permissions denied! Please run as sudo."
  echo -e "\033[0m"
  exit
fi

#-------------- check system
platform=""
arch=""

case "$OSTYPE" in
  darwin*)  platform="darwin" ;; #OSX
  linux*)   platform="linux" ;; #LINUX
esac

case $(uname -m) in
  armv6*)  arch="armv6l" ;;
  armv7*)  arch="armv7l" ;;
  armv8*)  arch="arm64" ;;
  aarch64*)  arch="arm64" ;;
  *)       [[ $(getconf LONG_BIT) = "64" ]] && arch="x64" || arch="x86" ;;
esac

if [[ $platform = "" || $arch = "" ]]
  then echo "This version of $OSTYPE/$(uname -m) is not supported!"
  echo -e "\033[0m"
  exit
else
  run
fi

