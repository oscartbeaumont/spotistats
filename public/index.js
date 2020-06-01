// Configuration
const spotify_api_client_id = "1107a25b98c041bb90c9063553e5f1a8";
const spotify_api_scopes = ["user-library-read", "playlist-read-private", "playlist-read-collaborative", "user-top-read", "user-read-recently-played"];

// Login Page
const loginPageElem = document.getElementById("login-page");
const loginBtn = document.getElementById("loginbtn");
const loginPage = async () => {
    loginBtn.onclick = () => {
        localStorage.clear(); // Prevent leaking info between users
        // Note: The state token is designed to provide CSRF protection
        let stateToken = Math.random().toString(36).substr(2);
        localStorage.setItem('auth_state_token', stateToken);
        window.location.href = `https://accounts.spotify.com/authorize?client_id=${spotify_api_client_id}&response_type=token&redirect_uri=${window.location.origin}&state=${stateToken}&scope=${spotify_api_scopes.join("%20")}`;
    };
    loginPageElem.style.display = "block";
};

// Profile Page
const profilePageElem = document.getElementById("profile-page");
const profileIcon = document.getElementById("profile-icon"); // TODO: add Elem to all their names
const profileUsername = document.getElementById("profile-username");
const profileFollowers = document.getElementById("profile-followers");
const profilePage = async () => {
    let user_icon = localStorage.getItem('user_icon');
    let user_display_name = localStorage.getItem('user_display_name');
    let user_followers = localStorage.getItem('user_followers');

    let res = fetch('https://api.spotify.com/v1/me', {
        headers: {
            "Authorization": localStorage.getItem('auth_access_token')
        }
    }).then(async res => {
        await reqErrorHandling(res)
        let data = await res.json();

        user_icon = data.images[0].url; // TODO: Get highest quality image
        user_display_name = data.display_name
        user_followers = data.followers.total
        localStorage.setItem('user_icon', user_icon);
        localStorage.setItem('user_display_name', user_display_name);
        localStorage.setItem('user_followers', user_followers);
    })
    if (!user_icon || !user_display_name || !user_followers) {
        await res;
    }

    if (profileIcon.src != user_icon) profileIcon.src = user_icon;
    profileIcon.alt = user_display_name;
    // TODO: profileIcon.onclick = () => window.location = data.external_urls.spotify; // TODO: Use data.uri if installed as PWA app
    profileUsername.innerText = user_display_name;
    profileFollowers.innerText = user_followers;
    profilePageElem.style.display = "block";
};

// TODO: Deprecated
// TODO: Minmise duplicate code
const errorTitleElem = document.getElementById("error-title");
const errorDescriptionElem = document.getElementById("error-description");
const errorCodeElem = document.getElementById("error-code");
async function reqErrorHandling(res) { // TODO: Rename
    switch (res.status) {
        case 200: break;
        case 201: break;
        case 202: break;
        case 204: break;
        // TODO: case 304: break;
        case 400:
            errorTitleElem.innerText = "400: Bad Request";
            errorDescriptionElem.innerText = "This probally being caused by either a bug in the application or a recent change to the Spotify API.";
            errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
            navigate("/error");
            throw new Error(errorTitleElem.innerText + " Shown Error Page!");
        case 401:
            localStorage.removeItem('auth_access_token')
            navigate("/login");
            throw new Error("401: Unauthorised. Please login again!");
        case 403:
            errorTitleElem.innerText = "403: Forbidden";
            errorDescriptionElem.innerText = "This probally being caused by a mismatch between the used endpoints and authorized scopes with the Spotify API.";
            errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
            navigate("/error");
            throw new Error(errorTitleElem.innerText + " Shown Error Page!");
        case 404:
            errorTitleElem.innerText = "404: Not Found";
            errorDescriptionElem.innerText = "This probally being caused by an out of date cache or bug in the application which resulted in Spotify being unable to find a resource.";
            errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
            navigate("/error");
            throw new Error(errorTitleElem.innerText + " Shown Error Page!");
        case 429:
        // TODO
        // console.log(res.headers.get('retry-after'))
        // setTimeout(, res.headers.get('retry-after') + 1)
        // errorTitleElem.innerText = "429: Rate Limited";
        // errorDescriptionElem.innerText = "Too many request have been made by this application, please try again later.";
        // errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
        // navigate("/error");
        // throw new Error(errorTitleElem.innerText + " Shown Error Page!");
        case 500:
            errorTitleElem.innerText = "500: Internal Server Error";
            errorDescriptionElem.innerText = "Spotify had an issue, please try again later.";
            errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
            navigate("/error");
            throw new Error(errorTitleElem.innerText + " Shown Error Page!");
        case 502:
            errorTitleElem.innerText = "502: Bad Gateway";
            errorDescriptionElem.innerText = "Spotify had an issue, please try again later.";
            errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
            navigate("/error");
            throw new Error(errorTitleElem.innerText + " Shown Error Page!");
        case 503:
            errorTitleElem.innerText = "503: Service Unavailable";
            errorDescriptionElem.innerText = "Spotify had an issue, please try again later.";
            errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
            navigate("/error");
            throw new Error(errorTitleElem.innerText + " Shown Error Page!");
        default: console.error("Spotify returned unknown status:", res.status)
    }
}

// TODO: Make show user output
// window.onerror = function(error) {
//     // do something clever here
//     alert(error); // do NOT do this for real!
//   };

// TODO: Custom fetch with Authorization with all error handling including .catch() error handling

async function fetchIt(url, options) {
    try {
        let res = await fetch(url, {
            headers: {
                "Authorization": localStorage.getItem('auth_access_token')
            }
        })

        switch (res.status) {
            case 200: break;
            case 201: break;
            case 202: break;
            case 204: break;
            // TODO: case 304: break;
            case 400:
                errorTitleElem.innerText = "400: Bad Request";
                errorDescriptionElem.innerText = "This probally being caused by either a bug in the application or a recent change to the Spotify API.";
                errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
                navigate("/error");
                throw new Error(errorTitleElem.innerText + " Shown Error Page!");
            case 401:
                localStorage.removeItem('auth_access_token')
                navigate("/login");
                throw new Error("401: Unauthorised. Please login again!");
            case 403:
                errorTitleElem.innerText = "403: Forbidden";
                errorDescriptionElem.innerText = "This probally being caused by a mismatch between the used endpoints and authorized scopes with the Spotify API.";
                errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
                navigate("/error");
                throw new Error(errorTitleElem.innerText + " Shown Error Page!");
            case 404:
                errorTitleElem.innerText = "404: Not Found";
                errorDescriptionElem.innerText = "This probally being caused by an out of date cache or bug in the application which resulted in Spotify being unable to find a resource.";
                errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
                navigate("/error");
                throw new Error(errorTitleElem.innerText + " Shown Error Page!");
            case 429:
                return new Promise((resolve, reject) => {
                    setTimeout(() => fetchIt(url, options).then(resolve).catch(reject), (res.headers.get('retry-after') + 1) * 1000)
                })
            case 500:
                errorTitleElem.innerText = "500: Internal Server Error";
                errorDescriptionElem.innerText = "Spotify had an issue, please try again later.";
                errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
                navigate("/error");
                throw new Error(errorTitleElem.innerText + " Shown Error Page!");
            case 502:
                errorTitleElem.innerText = "502: Bad Gateway";
                errorDescriptionElem.innerText = "Spotify had an issue, please try again later.";
                errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
                navigate("/error");
                throw new Error(errorTitleElem.innerText + " Shown Error Page!");
            case 503:
                errorTitleElem.innerText = "503: Service Unavailable";
                errorDescriptionElem.innerText = "Spotify had an issue, please try again later.";
                errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
                navigate("/error");
                throw new Error(errorTitleElem.innerText + " Shown Error Page!");
            default: console.error("Spotify returned unknown status:", res.status)
        }

        return await res.json();
    } catch (e) {
        throw e
    }
}

//TODO: Deprecated
const getAll = async (url, progress) => {
    let items = [];
    while (true) {
        let res = await fetch(url, {
            headers: {
                "Authorization": localStorage.getItem('auth_access_token')
            }
        })
        await reqErrorHandling(res);

        let data = await res.json();

        items = items.concat(data.items)

        if (progress) progress((data.offset + data.items.length) / data.total);
        if (!data.next) {
            break;
        }
        url = data.next;
    }
    return items
};

// TEMP
function createItem(name, description, images, private_icon, collaborative_icon) {
    let item = document.createElement('div');
    item.className = "item";

    let img;
    if (images.length >= 1) {
        img = document.createElement('img')
        img.src = images[0].url; // TODO: Get highest resolution
        img.width = 140;
        img.height = 140;
        img.loading = "lazy";
        img.alt = name;

        img.onload = () => {
            item.style.animation = "itemFadeIn 0.2s ease-in both";
        }
    } else {
        img = document.createElement('span');
        img.className = "default-icon";
        var icon = document.getElementById("generic-playlist-icon").cloneNode(true)
        icon.id = "";
        img.appendChild(icon);
        item.style.animation = "itemFadeIn 0.2s ease-in both";
    }
    item.appendChild(img);

    let info = document.createElement('div');

    let title = document.createElement('h3');
    title.innerText = name;
    info.appendChild(title);

    let subtitle = document.createElement('h4');
    if (description) {
        subtitle.innerText = description;
    }

    if (collaborative_icon) {
        let peopleIcon = document.createElement('span');
        peopleIcon.className = "icon";
        var icon = document.getElementById("people-icon").cloneNode(true)
        icon.id = "";
        peopleIcon.appendChild(icon);
        subtitle.prepend(peopleIcon);
    } else if (private_icon) {
        let lockIcon = document.createElement('span');
        lockIcon.className = "icon";
        var icon = document.getElementById("lock-icon").cloneNode(true)
        icon.id = "";
        lockIcon.appendChild(icon);
        subtitle.prepend(lockIcon);
    }

    info.appendChild(subtitle);
    item.appendChild(info);

    return item
}

// Favourites Page
const favouritesPageElem = document.getElementById("favourites-page");
const favouritesPageTypeTitle = document.getElementById("item-type-title");
const favouritesPageTypeSelect = document.getElementById("item-type-select");
const favouritesPageTimeSelect = document.getElementById("item-time-select");
const favouritesTracksElem = document.getElementById("favourite-tracks");
const favouritesArtistsElem = document.getElementById("favourite-artists");
let active_time_selection;

async function loadAndCache(storageItem, url, datasaver) {
    let value = JSON.parse(localStorage.getItem(storageItem));
    if (value == undefined) {
        if (datasaver !== true) {
            value = await getAll(url);
            localStorage.setItem(storageItem, JSON.stringify(value));
        } else {
            value = [];
        }
    }
    return value
}

const favouritesPage = async () => {
    let time_range = favouritesPageTimeSelect.querySelector(".active").getAttribute('time_range')
    if (time_range != active_time_selection) {
        active_time_selection = time_range;
        favouritesTracksElem.innerText = "";
        favouritesArtistsElem.innerText = "";
    }

    let datasaver = false;
    if ("connection" in navigator) {
        datasaver = navigator.connection.saveData === true
    }

    let top_tracks_medium_term = await loadAndCache('top_tracks_' + time_range, `https://api.spotify.com/v1/me/top/tracks?limit=30&time_range=${time_range}`)
    for (const [i, item] of top_tracks_medium_term.entries()) {
        favouritesTracksElem.appendChild(createItem((i + 1) + ". " + item.name, item.type == "track" ? item.artists.map(artist => artist.name).join(", ") : "", item.type == "track" ? item.album.images : item.images));
    }

    loadAndCache('top_artists_' + time_range, `https://api.spotify.com/v1/me/top/artists?limit=30&time_range=${time_range}`, datasaver).then(data => {
        for (const [i, item] of data.entries()) {
            favouritesArtistsElem.appendChild(createItem((i + 1) + ". " + item.name, item.type == "track" ? item.artists.map(artist => artist.name).join(", ") : "", item.type == "track" ? item.album.images : item.images));
        }
    });

    for (const child of favouritesPageTypeSelect.children) {
        child.onclick = e => {
            let target = e.target.innerText;
            if (target == favouritesPageTypeTitle.innerText) {
                return
            }
            favouritesPageTypeTitle.innerText = target;
            for (const child of favouritesPageTypeSelect.children) {
                child.className = "";
            }
            e.target.className = "active";

            if (target == "Tracks") {
                favouritesTracksElem.style.display = "block";
                favouritesArtistsElem.style.display = "none";
            } else if (target == "Artists") {
                favouritesTracksElem.style.display = "none";
                favouritesArtistsElem.style.display = "block";
                if (favouritesArtistsElem.children.length == 0) {
                    loadAndCache('top_artists_' + time_range, `https://api.spotify.com/v1/me/top/artists?limit=30&time_range=${time_range}`).then(data => {
                        for (const [i, item] of data.entries()) {
                            favouritesArtistsElem.appendChild(createItem((i + 1) + ". " + item.name, item.type == "track" ? item.artists.map(artist => artist.name).join(", ") : "", item.type == "track" ? item.album.images : item.images));
                        }
                    });
                }
            }
        }
    }

    for (const child of favouritesPageTimeSelect.children) {
        child.onclick = e => {
            for (const child of favouritesPageTimeSelect.children) {
                child.className = "";
            }
            e.target.className = "active";
            favouritesPage();
        }
    }

    favouritesPageElem.style.display = "block";
};

// Export Page
const exportPageElem = document.getElementById("export-page");
const exportProgressElem = document.getElementById("export-progress");
const exportPlaylistsElem = document.getElementById("export-playlists");
const exportAllElem = document.getElementById("backup-all");

const parseThroughPromise = async res => new Promise(resolve => resolve(res))
async function downloadURL(baseURL, totalAvailableProgress) {
    let csvRaw = "Spotify ID,Artist IDs,Track Name,Album Name,Artist Name(s),Release Date,Duration (ms),Popularity,Added By,Added At,Genres,Danceability,Energy,Key,Loudness,Mode,Speechiness,Acousticness,Instrumentalness,Liveness,Valence,Tempo,Time Signature\n";
    const songs_group_1 = await fetchIt(baseURL);
    let fetchers = [];

    let fetchersCount = Math.ceil(songs_group_1.total / songs_group_1.limit);
    var randomPromiseDelay = async res => new Promise(resolve => setTimeout(() => resolve(res), (Math.floor(Math.random() * (Math.ceil(fetchersCount / 10))) + 2) * 1000));
    let progressIncrement = (totalAvailableProgress || 1) / 3 / fetchersCount;

    for (let i = 0; i < fetchersCount; i++) {
        fetchers[i] = new Promise((resolve, reject) => { // TODO: make reject work
            if (i == 0) {
                var fetcher = new Promise(resolve => resolve(songs_group_1));
            } else {
                var fetcher = fetchIt(baseURL + "&offset=" + (i * songs_group_1.limit));
            }

            fetcher.then(async res => {
                exportProgressElem.value += progressIncrement;
                return res
            }).then(i < 10 ? parseThroughPromise : randomPromiseDelay).then(async res => {
                res.items = res.items.filter(song => song.track != undefined).filter(song => !song.track.is_local)
                let audioFeatures = await fetchIt("https://api.spotify.com/v1/audio-features?ids=" + res.items.map(song => song.track.id).join(","))
                res.audio_features = audioFeatures.audio_features;
                exportProgressElem.value += progressIncrement;
                return res
            }).then(i < 10 ? parseThroughPromise : randomPromiseDelay).then(async res => {
                let artistIDs = res.items.map(song => song.track.artists[0].id);
                let artists_group_one = await fetchIt("https://api.spotify.com/v1/artists?ids=" + artistIDs.slice(0, 50).join(","))
                res.artists = artists_group_one.artists

                if (artistIDs.length > 50) {
                    let artists_group_two = await fetchIt("https://api.spotify.com/v1/artists?ids=" + (artistIDs.slice(50, 101) || []).join(","));
                    res.artists = res.artists.concat(artists_group_two.artists)
                }

                exportProgressElem.value += progressIncrement;
                return res
            }).then(res => {
                for (let i = 0; i < res.items.length; i++) {
                    let song = res.items[i];
                    let audio_features = res.audio_features[i];
                    let artist = res.artists[i];

                    csvRaw += [song.track.id, `"` + song.track.artists.map(artist => artist.id).join(",") + `"`, `"` + song.track.name.replace(/"/g, `""`) + `"`, `"` + song.track.album.name.replace(/"/g, `""`) + `"`, `"` + song.track.artists.map(artist => artist.name).join(",").replace(/"/g, `""`) + `"`, song.track.album.release_date, song.track.duration_ms, song.track.popularity, song.added_by ? song.added_by.id : "", song.added_at, `"` + artist.genres.join(",").replace(/"/g, `""`) + `"`, audio_features.danceability, audio_features.energy, audio_features.key, audio_features.loudness, audio_features.mode, audio_features.speechiness, audio_features.acousticness, audio_features.instrumentalness, audio_features.liveness, audio_features.valence, audio_features.tempo, audio_features.time_signature].join(",") + "\n";
                }
            }).then(() => resolve()).catch(reject);
        })
    }

    await Promise.all(fetchers);
    return csvRaw;
}

function download(name, body) {
    var e = document.createElement('a');
    e.style.display = 'none';
    e.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(body));
    e.setAttribute('download', name + '.csv');
    document.body.appendChild(e);
    e.click();
    document.body.removeChild(e);
}

const exportPage = async () => {
    try {
        var playlists = await getAll('https://api.spotify.com/v1/me/playlists?limit=50');
    } catch (err) {
        console.error(err);
        return
    }

    playlists.unshift({
        name: "Liked Songs",
        public: true,
        images: [],
    });

    playlists.forEach(playlist => {
        let item = createItem(playlist.name, playlist.owner?.display_name, playlist.images, !playlist.public, playlist.collaborative);
        item.setAttribute("spotify_id", playlist.id);

        item.onclick = async () => {
            if (exportProgressElem.value != 0) {
                alert("Please wait for current download to complete before starting another!")
                return;
            }
            exportProgressElem.style.display = "block";

            if (playlist.name == "Liked Songs") {
                var baseURL = `https://api.spotify.com/v1/me/tracks?limit=50`;
            } else {
                var baseURL = `https://api.spotify.com/v1/playlists/${playlist.id}/tracks?limit=100`;
            }
            download(playlist.name, await downloadURL(baseURL));

            exportProgressElem.style.display = "none";
            exportProgressElem.value = 0;
        }

        exportPlaylistsElem.appendChild(item)
    });

    exportAllElem.onclick = async () => {
        if (exportProgressElem.value != 0) {
            alert("Please wait for current download to complete before starting another!")
            return;
        }
        exportProgressElem.style.display = "block";

        var zip = new JSZip();
        let totalAvailableProgress = 1 / exportPlaylistsElem.children.length;
        for (const child of exportPlaylistsElem.children) {
            if (child.getAttribute("spotify_id") == "undefined") {
                var baseURL = `https://api.spotify.com/v1/me/tracks?limit=50`
                continue; // TEMP
            } else {
                var baseURL = `https://api.spotify.com/v1/playlists/${child.getAttribute("spotify_id")}/tracks?limit=100`
            }

            try {
                zip.file(child.querySelector("h3").innerText + ".csv", await downloadURL(baseURL, totalAvailableProgress));
            } catch (e) {
                // TODO
                console.error(e)
            }
        }

        zip.file("user.json", JSON.stringify({
            user_icon: localStorage.getItem('user_icon'),
            user_display_name: localStorage.getItem('user_display_name'),
            user_followers: localStorage.getItem('user_followers')
        }));

        zip.generateAsync({ type: "base64" }).then(base64 => {
            // TODO: Make download helper func
            var e = document.createElement('a');
            e.style.display = 'none';
            e.setAttribute('href', "data:application/zip;base64," + base64);
            e.setAttribute('download', 'Music.zip');

            document.body.appendChild(e);
            e.click();
            document.body.removeChild(e);
        });

        exportProgressElem.style.display = "none";
        exportProgressElem.value = 0;
    };

    exportPageElem.style.display = "block";
};

// Taste Page
const tastePageElem = document.getElementById("taste-page");
const tastePage = async () => {
    tastePageElem.style.display = "block";
}

// Menu
const menuElem = document.getElementById("menu");

const menu = async (visible) => {
    if (visible == false) {
        menuElem.style.display = "none";
        return
    }

    for (const child of menuElem.children) {
        let path = child.getAttribute('path')
        if (path) {
            child.onclick = () => {
                navigate(path)
            }
        }
    }

    menuElem.style.display = "block";



    // TODO: Active Item
};

let pageElems = document.getElementsByClassName('page');
function navigate(url) {
    if (url != "/error") {
        window.history.pushState(null, "Spotistats", url)
    }

    for (const child of pageElems) {
        if (child.id == "menu") continue;
        child.style.display = "none";
    }

    if (!navigator.onLine) {
        menu(false);
        document.getElementById("offline-page").style.display = "block";
        return;
    }

    switch (url) {
        case '/login': menu(false); loginPage(); break;
        case '/': menu(); profilePage(); break;
        case '/favourites': menu(); favouritesPage(); break;
        case '/taste': menu(); tastePage(); break;
        case '/export': menu(); exportPage(); break;
        case '/error': menu(); document.getElementById("error-page").style.display = "block"; break;
        default: menu(); document.getElementById("not-found-page").style.display = "block";
    }
}

// Startup app
document.addEventListener("DOMContentLoaded", async () => {
    var urlHash = new URLSearchParams(window.location.hash.substr(1));
    if (urlHash.has('access_token')) {
        if (urlHash.get('state') == localStorage.getItem('auth_state_token')) {
            localStorage.setItem('auth_access_token', urlHash.get('token_type') + " " + urlHash.get('access_token'));
        }
        localStorage.removeItem('auth_state_token');
        history.replaceState(null, null, ' ');
    }

    if (!localStorage.getItem('auth_access_token')) navigate('/login');

    // TODO: Fullpage loader with nice fade out until data up ??

    navigate(window.location.pathname);
});

window.addEventListener('online', () => {
    if (document.getElementById("offline-page").style.display == "block") {
        setTimeout(() => {
            document.getElementById("offline-page").style.display = "none";
            navigate('/');
        }, 1000)
    }
});

if ('serviceWorker' in navigator) {
    const escapeHTMLPolicy = trustedTypes.createPolicy('myEscapePolicy', {
        createScriptURL: string => string
    });

    window.addEventListener('load', () => {
        navigator.serviceWorker.register(escapeHTMLPolicy.createScriptURL("/sw.js"))
            .catch(err => console.error('Error registering service worker', err));
    });
}