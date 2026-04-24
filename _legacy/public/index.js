// Configuration
const spotify_api_client_id = "1107a25b98c041bb90c9063553e5f1a8";
const spotify_api_scopes = ["user-library-read", "playlist-read-private", "playlist-read-collaborative", "user-top-read", "user-read-recently-played"];

/*
    Helpers
*/
const escapeHTMLPolicy = trustedTypes.createPolicy('myEscapePolicy', {
    createScriptURL: string => string
});

const errorTitleElem = document.getElementById("error-title");
const errorDescriptionElem = document.getElementById("error-description");
const errorCodeElem = document.getElementById("error-code");
async function fetchIt(url, options) {
    try {
        let res = await fetch(url, {
            headers: {
                "Authorization": localStorage.getItem('auth_access_token')
            },
            cache: "no-store",
            ...options
        })

        // TODO: Minimise all duplicate code & messages here
        switch (res.status) {
            case 200: break;
            case 201: break;
            case 202: break;
            case 204: break;
            case 304: break;
            case 400:
                errorTitleElem.innerText = "400: Bad Request";
                errorDescriptionElem.innerText = "This probally being caused by either a bug in the application or a recent change to the Spotify API.";
                errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
                navigate("/error");
                throw new Error("Spotistats: " + errorTitleElem.innerText + " Shown Error Page!");
            case 401:
                localStorage.removeItem('auth_access_token')
                navigate("/login");
                throw new Error("Spotistats: " + "401: Unauthorised. Please login again!");
            case 403:
                errorTitleElem.innerText = "403: Forbidden";
                errorDescriptionElem.innerText = "This probally being caused by a mismatch between the used endpoints and authorized scopes with the Spotify API.";
                errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
                navigate("/error");
                throw new Error("Spotistats: " + errorTitleElem.innerText + " Shown Error Page!");
            case 404:
                errorTitleElem.innerText = "404: Not Found";
                errorDescriptionElem.innerText = "This probally being caused by an out of date cache or bug in the application which resulted in Spotify being unable to find a resource.";
                errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
                navigate("/error");
                throw new Error("Spotistats: " + errorTitleElem.innerText + " Shown Error Page!");
            case 429:
                return new Promise((resolve, reject) => {
                    setTimeout(() => fetchIt(url, options).then(resolve).catch(reject), (res.headers.get('retry-after') + 1) * 1000)
                })
            case 500:
                errorTitleElem.innerText = "500: Internal Server Error";
                errorDescriptionElem.innerText = "Spotify had an issue, please try again later.";
                errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
                navigate("/error");
                throw new Error("Spotistats: " + errorTitleElem.innerText + " Shown Error Page!");
            case 502:
                errorTitleElem.innerText = "502: Bad Gateway";
                errorDescriptionElem.innerText = "Spotify had an issue, please try again later.";
                errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
                navigate("/error");
                throw new Error("Spotistats: " + errorTitleElem.innerText + " Shown Error Page!");
            case 503:
                errorTitleElem.innerText = "503: Service Unavailable";
                errorDescriptionElem.innerText = "Spotify had an issue, please try again later.";
                errorCodeElem.innerText = JSON.stringify(await res.json(), null, 2);
                navigate("/error");
                throw new Error("Spotistats: " + errorTitleElem.innerText + " Shown Error Page!");
            default: console.error("Spotify returned unknown status:", res.status)
        }

        return await res.json();
    } catch (e) {
        if (e.toString().startsWith("Error: Spotistats: ")) {
            throw e;
        }

        errorTitleElem.innerText = "Accessing Spotify API";
        errorDescriptionElem.innerText = "The network request failed, please reload to try again.";
        errorCodeElem.innerText = JSON.stringify(e.toString(), null, 2);
        navigate("/error");
        throw e;
    }
}

function createItem(name, description, images, url, private_icon, collaborative_icon) {
    let item = document.createElement('div');
    item.className = "item";

    if (url != undefined) {
        if (url.startsWith("spotify:")) {
            item.onclick = () => window.location = url;
        } else {
            item.onclick = () => window.open(url, '_blank');
        }
    }

    let img = document.createElement('img');
    if (images.length >= 1) {
        img.src = images[0].url;
    } else {
        img.src = "/assets/placeholder.svg";
        img.className = "svg";
        img.style.filter = "invert(1)";
    }
    img.width = 140;
    img.height = 140;
    img.loading = "lazy";
    img.alt = name;
    img.onload = () => item.style.animation = "itemFadeIn 0.2s ease-in both";
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
        let peopleIcon = document.createElement('img');
        peopleIcon.className = "icon svg";
        peopleIcon.src = "/assets/people-icon.svg"
        subtitle.prepend(peopleIcon);
    } else if (private_icon) {
        let lockIcon = document.createElement('img');
        lockIcon.className = "icon svg";
        lockIcon.src = "/assets/lock-icon.svg";
        subtitle.prepend(lockIcon);
    }

    info.appendChild(subtitle);
    item.appendChild(info);

    return item
}

function mountRoute(url, title, showMenu, handler) {
    let elem = document.querySelector(".page[path='" + url + "']");
    if (elem == undefined || handler == undefined) {
        console.log("Error mounting route", url);
        return;
    }
    elem.onload = () => {
        if (title != undefined) document.title = title;
        document.getElementById("menu").style.display = showMenu ? "block" : "none";
        handler();
    }
}

// TODO: Fix changing pages quickly causing both to appear
function navigate(url) {
    if (url != "/error") window.history.pushState(null, "Spotistats", url)

    if (!navigator.onLine) {
        menu(false);
        document.getElementById("offline-page").style.display = "block";
        return;
    }

    var pageFunc;
    for (const child of document.getElementsByClassName('page')) {
        if (child.id == "menu") continue;
        if (child.getAttribute("path") == url) {
            if (child.onload) pageFunc = child.onload;
            continue;
        };
        if (child.style.display != "none") child.style.display = "none";
    }

    if (pageFunc == undefined) pageFunc = document.querySelector(".page[path='" + "/404" + "']").onload;
    pageFunc();
}

/*
    Login Page
*/
mountRoute("/login", "Spotistats | Login", false, () => {
    document.getElementById("loginbtn").onclick = () => {
        localStorage.clear();
        let stateToken = Math.random().toString(36).substr(2); //  The state token is designed to provide CSRF protection
        localStorage.setItem('auth_state_token', stateToken);
        window.location.href = `https://accounts.spotify.com/authorize?client_id=${spotify_api_client_id}&response_type=token&redirect_uri=${window.location.origin}&state=${stateToken}&scope=${spotify_api_scopes.join("%20")}`;
    };
    document.getElementById("login-page").style.display = "block";
});

/*
    Profile Page
*/
const profileIconElem = document.getElementById("profile-icon"); // TODO: add Elem to all their names
mountRoute("/", "Spotistats | Profile", true, async () => {
    let user_icon = localStorage.getItem('user_icon');
    let user_url = localStorage.getItem('user_url');
    let user_display_name = localStorage.getItem('user_display_name');
    let user_followers = localStorage.getItem('user_followers');

    var renderProfiePage = () => {
        if (user_icon == undefined) {
            profileIconElem.src = "/assets/placeholder.svg";
            profileIconElem.className = "svg";
        } else {
            if (profileIconElem.src != user_icon) profileIconElem.src = user_icon;
            profileIconElem.alt = user_display_name;
        }
        document.getElementById("profile-icon-link").href = user_url;
        document.getElementById("profile-username").innerText = user_display_name;
        document.getElementById("profile-followers").innerText = user_followers;
        document.getElementById("profile-page").style.display = "block";
    }

    var getData = new Promise((resolve, reject) => {
        fetchIt('https://api.spotify.com/v1/me').then(async data => {
            user_icon = data.images[0]?.url;
            user_url = localStorage.getItem('link_to_uri') ? data.uri : data.external_urls.spotify;
            user_display_name = data.display_name
            user_followers = data.followers.total
            localStorage.setItem('user_icon', user_icon);
            localStorage.setItem('user_url', user_url);
            localStorage.setItem('user_display_name', user_display_name);
            localStorage.setItem('user_followers', user_followers);

            renderProfiePage();
        }).then(resolve).catch(reject)
    });

    if (!user_display_name || !user_followers) {
        await getData;
    } else {
        renderProfiePage();
    }
});

//////// TODO: CLEANUP EVERYTHING BELOW

// Favourites Page
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
            let playlists = [];
            value = [];
            while (true) {
                let data = await fetchIt(url);
                value = value.concat(data.items);
                // TODO: Progress progress(data.offset + data.items.length) / data.total)
                if (!data.next) break;
                url = data.next;
            }

            // value = await getAll(url);
            localStorage.setItem(storageItem, JSON.stringify(value));
        } else {
            value = [];
        }
    }
    return value
}

mountRoute("/favourites", "Spotistats | Favourites", true, async () => {
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
        favouritesTracksElem.appendChild(createItem((i + 1) + ". " + item.name, item.type == "track" ? item.artists.map(artist => artist.name).join(", ") : "", item.type == "track" ? item.album.images : item.images, localStorage.getItem('link_to_uri') ? item.uri : item.external_urls.spotify));
    }

    loadAndCache('top_artists_' + time_range, `https://api.spotify.com/v1/me/top/artists?limit=30&time_range=${time_range}`, datasaver).then(data => {
        for (const [i, item] of data.entries()) {
            favouritesArtistsElem.appendChild(createItem((i + 1) + ". " + item.name, item.type == "track" ? item.artists.map(artist => artist.name).join(", ") : "", item.type == "track" ? item.album.images : item.images, localStorage.getItem('link_to_uri') ? item.uri : item.external_urls.spotify));
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
                            favouritesArtistsElem.appendChild(createItem((i + 1) + ". " + item.name, item.type == "track" ? item.artists.map(artist => artist.name).join(", ") : "", item.type == "track" ? item.album.images : item.images, localStorage.getItem('link_to_uri') ? item.uri : item.external_urls.spotify));
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
            document.querySelector(".page[path='" + "/favourites" + "']").onload();
        }
    }

    document.getElementById("favourites-page").style.display = "block";
});

// Taste Page
mountRoute("/taste", "Spotistats | Taste", true, async () => {
    // TODO: More work needs to be done before being released

    // let recentsTracks = await fetchIt('https://api.spotify.com/v1/me/player/recently-played?limit=50');
    // let recentsTrackIDs = recentsTracks.items.map(song => song.track.id);
    // let audioFeatures = await fetchIt("https://api.spotify.com/v1/audio-features?ids=" + recentsTrackIDs.join(","));

    // console.log(recentsTracks);
    // console.log(audioFeatures.audio_features);

    // // TODO: Most popular genre, You "Normal" Audio features

    // let avg_danceability = 0;
    // let avg_energy = 0;
    // let avg_instrumentalness = 0;
    // let avg_speechiness = 0;
    // let avg_tempo = 0;
    // let avg_valence = 0;
    // for (const [i, track] of audioFeatures.audio_features.entries()) {
    //     avg_danceability += track.danceability;
    //     avg_energy += track.energy;
    //     avg_instrumentalness += track.instrumentalness;
    //     avg_speechiness += track.speechiness;
    //     avg_tempo += track.tempo;
    //     avg_valence += track.valence;
    // }
    // avg_danceability = (avg_danceability / audioFeatures.audio_features.length).toFixed(2);
    // avg_energy = (avg_energy / audioFeatures.audio_features.length).toFixed(2);
    // avg_instrumentalness = (avg_instrumentalness / audioFeatures.audio_features.length).toFixed(2);
    // avg_speechiness = (avg_speechiness / audioFeatures.audio_features.length).toFixed(2);
    // avg_tempo = (avg_tempo / audioFeatures.audio_features.length).toFixed(0);
    // avg_valence = (avg_valence / audioFeatures.audio_features.length).toFixed(2);

    // console.log(avg_danceability, avg_energy, avg_instrumentalness, avg_speechiness, avg_tempo, avg_valence);

    document.getElementById("taste-page").style.display = "block";
});

// Recommendations Page
const recommendationsElem = document.getElementById("recommendations");
mountRoute("/recommendations", "Spotistats | Recommendations", true, async () => {
    // TODO: Not ready for production but will be added in future release
    // // TODO: Criteria

    // // seed_artists=4NHQUGzhtTLFvgF5SZesLK,45dkTj5sMRSjrmBSBeiHym&valence=0'); // ,2cFrymmkijnjDg9SS92EPM,41MozSoPIsD1dJM0CLPjZF
    // let seed_tracks = ["4k3uABcX9iaGlt5pRJhumi" /* Stupid */];
    // let seed_artists = ["45dkTj5sMRSjrmBSBeiHym" /* Tate McRae */]; // "4NHQUGzhtTLFvgF5SZesLK" /* Tove Lo */

    // // let target_acousticness = 0.5;
    // // let target_danceability = 0.5;
    // // let target_energy = 0.5;
    // // let target_instrumentalness = 0.5;
    // // let target_popularity = 50;
    // // let target_speechiness = 
    // // let target_tempo = 
    // // let target_valence = 

    // if (seed_artists.length + seed_tracks.length > 5) {
    //     alert("Error") // TODO
    //     return;
    // }

    // let recommendations = await fetchIt("https://api.spotify.com/v1/recommendations?limit=50" + (seed_tracks.length > 0 ? "&seed_tracks=" + seed_tracks.join(",") : "") + (seed_artists.length > 0 ? "&seed_artists=" + seed_artists.join(",") : ""));

    // let isRecommendationAlreadyKnown = await fetchIt("https://api.spotify.com/v1/me/tracks/contains?ids=" + recommendations.tracks.map(song => song.id))
    // let i = 0;
    // recommendationsElem.innerText = "";
    // for (const [ii, track] of recommendations.tracks.entries()) {
    //     // console.log(track.name, isRecommendationAlreadyKnown[ii])
    //     if (isRecommendationAlreadyKnown[ii]) {
    //         // console.log("Removing", i)
    //         recommendations.tracks.splice(i, 1); // TODO: Fix this cause sometimes not working
    //         i--;
    //     } else {
    //         recommendationsElem.appendChild(createItem(track.name, track.artists.map(artist => artist.name).join(", "), track.album.images, localStorage.getItem('link_to_uri') ? track.uri : track.external_urls.spotify));
    //     }
    //     i++;
    // }

    document.getElementById("recommendations-page").style.display = "block";

    // https://developer.spotify.com/documentation/web-api/reference/browse/get-recommendations/
    // TODO: Maybe try inifinite scrolling. Just keep asking API for more as you go down?
    // - https://stackoverflow.com/questions/6456846/how-to-do-an-infinite-scroll-in-plain-javascript
});

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

mountRoute("/export", "Spotistats | Export", true, async () => {
    let jszipScript = document.createElement('script');
    jszipScript.src = escapeHTMLPolicy.createScriptURL("/jszip/jszip.min.js");
    document.body.appendChild(jszipScript);

    let playlists = [];
    let url = "https://api.spotify.com/v1/me/playlists?limit=50";
    while (true) {
        let data = await fetchIt(url);
        playlists = playlists.concat(data.items)
        // TODO: Progress progress(data.offset + data.items.length) / data.total)
        if (!data.next) break;
        url = data.next;
    }

    playlists.unshift({
        name: "Liked Songs",
        public: true,
        images: [],
    });

    exportPlaylistsElem.innerText = "";
    playlists.forEach(playlist => {
        let item = createItem(playlist.name, playlist.owner?.display_name, playlist.images, undefined, !playlist.public, playlist.collaborative);
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
});

// Reset
mountRoute("/reset", "Spotistats | Reset", false, async () => {
    let registrations = await navigator.serviceWorker.getRegistrations()
    for (let registration of registrations) {
        registration.unregister()
    }

    let caches = await window.caches.keys();
    for (let cache of caches) {
        window.caches.delete(cache);
    }

    localStorage.clear();

    alert("Cache Reset!");
    navigate("/login");
});

// Error
mountRoute("/error", undefined, true, () => {
    document.getElementById("error-page").style.display = "block";
});

// Not Found
mountRoute("/404", "Spotistats | Not Found", true, () => {
    document.getElementById("not-found-page").style.display = "block";
});

/*
    App Startup & Registration
*/
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

    for (const child of document.getElementById("menu").children) {
        let path = child.getAttribute('path');
        if (path) child.onclick = () => navigate(path);
    }

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
    window.addEventListener('load', () => {
        navigator.serviceWorker.register(escapeHTMLPolicy.createScriptURL("/sw.js"))
            .catch(err => console.error('Error registering service worker', err));
    });
}

window.onbeforeunload = () => window.scrollTo(0, 0);