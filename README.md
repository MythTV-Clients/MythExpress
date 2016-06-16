MythExpress is a browser-based interface to MythTV’s HTTP streaming capability. It began as a exercise for learning about NodeJS with Express and also HTML5 and over time has become something quite useful for me.


#OVERVIEW

MythExpress consists of two pieces: a nodejs server which talks to your MythTV backend and a web application which communicates with the node server and manages the “one page” web interface. The web application tries to work in regular desktop browsers and also as an iOS full screen web app (add an icon to the home screen for this).

My environment is Apple-centric so everything is known to work on current versions of desktop and mobile Safari. MythTV 0.25 or later is supported. With 0.25 a local/UTC bug prevents it from recognizing new recordings on the fly but other than that it works identically to 0.26.

MythExpress is 100% Open Source software licensed under terms of the GPLv3. The text of the license is available within the web app.


##INSTALLATION

It’s typical to run MythExpress on the same host as MythTV but it can go anywhere on your network so long as it has visibility to your myth server(s).

NodeJS is required of course, MythExpress is developed and tested against whatever is currently stable. Should your platform lack current node packages you can streamline the install process with Node Version Manager which is found at http://github.com/creationix/nvm.

Here’s a quickie nvm-based install using debian names for the prerequisite packages:

    # do this from any account, doesn’t have to be the myth one

    sudo apt-get install curl git-core g++ libavahi-compat-libdnssd-dev build-essential libssl-dev

    git clone git://github.com/creationix/nvm.git ~/.nvm
    . ~/.nvm/nvm.sh
    nvm install v4

    git clone https://github.com/MythTV-Clients/MythExpress
    cd MythExpress
    npm install

    node app.js

Browse to port 6565 of the install machine and, assuming MythTV is running, you should see a list of recordings.


##INTEGRATION

The source folder “extras” contains a few scripts which run MythExpress on Debian-ish systems. Probably they’re adaptable to other distros as well.

    # from the install account

    su -
    cp MythExpress/extras/mythexpress.debian.defaults /etc/default/mythexpress
    ln -s $PWD/MythExpress/extras/mythexpress.debian.init /etc/init.d/mythexpress
    update-rc.d mythexpress defaults

    # adjust /etc/default/mythexpress to taste

	mkdir /var/run/mythexpress     # or whatever you used in the defaults
        # make sure install user can write to the run folder

    /etc/init.d/mythexpress start


##CONFIGURATION

MythExpress orients itself automatically using Bonjour but a few environment variables are recognized for special cases:

MX_AFFINITY - restrict connections to this host. Useful when you have multiple myth backends such as a master & secondary setup or a separate development box. The value has to match Bonjour’s host property exactly, eg. "mythhost.local.".

MX_LISTEN - port which MythExpress should use. Defaults to 6565.

MX_HOST - name or IP to use when supplying backend links to clients. If you have MythTV running on HostA but MythExpress is on HostB you should define MX_HOST=HostA.

MX_PASSIVE - setting any value causes MythExpress to refrain from locking the backend while a browser client is connected.


##AKNOWLEDGEMENTS

A tip o’ the hat to the many developers involved with MythTV over the years, you make it rock. Also, Ryan Dahl, TJ Holowaychuk, and John Resig for their frameworks & platforms which made MythExpress such a pleasure to write. Finally, a big shoutout to whoever invented computer science, I would be a hobo without you!