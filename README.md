
MythExpress is a browser based MythTV interface with support for HLS streaming, direct play in the browser, and frontend remote control. It began as a exercise for learning about NodeJS with Express and also HTML5 and over time has become something quite useful for me and, hopefully, you.


##INSTALLATION

It’s typical to run MythExpress on the same host as MythTV but it can go anywhere that has visibility to your myth server(s).

NodeJS is required of course. Should your platform lack node packages you can streamline the install process with nvm which is found at http://github.com/creationix/nvm.


##CONFIGURATION

MythExpress orients itself automatically using Bonjour but a few environment variables are recognized for special cases:

MX_AFFINITY = restrict connections to this host. Useful when you have multiple myth backends such as a master & secondary setup or a separate development box. The value has to match Bonjour’s host property exactly, eg. "mythhost.local.".

MX_LISTEN - port which MythExpress should use. Defaults to 6565.
