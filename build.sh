#!/bin/bash

# Fonts
curl -L -o .fontfiles.zip "https://google-webfonts-helper.herokuapp.com/api/fonts/montserrat?download=zip&subsets=latin&variants=700,regular&formats=woff,woff2"
unzip -o .fontfiles.zip -d fonts
rm -rf .fontfiles.zip

# Jszip
curl -L -o .jszip.zip "https://github.com/Stuk/jszip/archive/master.zip"
unzip -o -j .jszip.zip 'jszip-master/dist/*' -d jszip
rm -rf .jszip.zip