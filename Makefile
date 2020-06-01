download-deps: download-fonts download-jszip

download-fonts:
	curl -s -L -o .fontfiles.zip "https://google-webfonts-helper.herokuapp.com/api/fonts/montserrat?download=zip&subsets=latin&variants=700,regular&formats=woff,woff2"
	unzip -o .fontfiles.zip -d public/fonts
	rm -rf .fontfiles.zip

download-jszip:
	curl -s -L -o .jszip.zip "https://github.com/Stuk/jszip/archive/master.zip"
	unzip -o -j .jszip.zip 'jszip-master/dist/*' -d public/jszip
	rm -rf .jszip.zip

setup: download-deps
	cp -R assets public/assets

install-build-tools:
	npm install -g html-minifier
	npm install -g cssnano-cli
	npm install -g babel-minify

build: download-deps
	mkdir dist/
	cp -R assets dist/assets
	cp -R public/jszip dist/
	cp -R public/jszip dist/
	cp public/_headers dist/
	cp public/_redirects dist/
	cp public/manifest.webmanifest dist/
	html-minifier --collapse-whitespace --remove-comments --remove-optional-tags --remove-redundant-attributes --remove-script-type-attributes --remove-tag-whitespace --use-short-doctype public/index.html -o dist/index.html
	cssnano public/index.css dist/index.css --safe
	minify public/*.js -d dist