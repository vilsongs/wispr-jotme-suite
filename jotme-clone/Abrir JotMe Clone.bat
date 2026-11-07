@echo off
cd /d "C:\Videos\jotme-clone"
node build.mjs
start "" "C:\Videos\wispr-clone\node_modules\electron\dist\electron.exe" "C:\Videos\jotme-clone"
